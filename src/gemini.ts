import { requestUrl } from "obsidian";
import { buildSystemPrompt } from "./prompts";

export interface ImageInput {
	mimeType: string;
	base64Data: string;
}

export interface TranscriptionRequest {
	apiKey: string;
	model: string;
	images: ImageInput[];
	userCustomPrompt?: string;
	noteSpecificInstruction?: string;
	enablePageBreaks?: boolean;
	isCancelled?: () => boolean;
}

interface GeminiTextPart {
	text?: string;
}

interface GeminiCandidate {
	finishReason?: string;
	finishMessage?: string;
	content?: { parts?: GeminiTextPart[] };
}

interface GeminiResponse {
	candidates?: GeminiCandidate[];
}

interface HttpErrorDetails {
	status: number;
	text?: string;
	message?: string;
}

export class TranscriptionCancelledError extends Error {
	constructor() {
		super("Transcription cancelled.");
		this.name = "TranscriptionCancelledError";
	}
}

export async function transcribeImagesWithGemini(request: TranscriptionRequest): Promise<string> {
	const { apiKey, model, images, userCustomPrompt, noteSpecificInstruction, enablePageBreaks, isCancelled } = request;

	if (!apiKey || apiKey.trim().length === 0) {
		throw new Error("Gemini API key is not configured. Please add your API key in Settings > Handwritten Notebook Digitizer.");
	}

	if (!images || images.length === 0) {
		throw new Error("No images provided for transcription.");
	}

	const promptText = buildSystemPrompt(userCustomPrompt, noteSpecificInstruction, !!enablePageBreaks);

	const parts: Array<GeminiTextPart | { inline_data: { mime_type: string; data: string } }> = [
		{
			text: promptText,
		},
	];

	// Append each image as inline_data part
	for (let i = 0; i < images.length; i++) {
		const img = images[i];
		parts.push({
			inline_data: {
				mime_type: img.mimeType || "image/jpeg",
				data: img.base64Data,
			},
		});
	}

	const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

	const requestPayload = {
		contents: [
			{
				parts: parts,
			},
		],
		generationConfig: {
			temperature: 0.1,
			maxOutputTokens: 8192,
		},
	};

	let lastError: unknown = null;
	const maxRetries = 2;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			throwIfCancelled(isCancelled);
			if (attempt > 0) {
				// Wait with backoff before retry (1.5s, 3s)
				await new Promise((resolve) => window.setTimeout(resolve, attempt * 1500));
				throwIfCancelled(isCancelled);
			}

			const response = await requestUrl({
				url: endpoint,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": apiKey.trim(),
				},
				body: JSON.stringify(requestPayload),
			});

			if (response.status !== 200) {
				if ((response.status === 503 || response.status === 500) && attempt < maxRetries) {
					lastError = { status: response.status, text: response.text };
					continue; // Retry on transient server overload
				}
				handleHttpError(response.status, response.text, model);
			}

			throwIfCancelled(isCancelled);
			return extractTranscription(response.json);
		} catch (error: unknown) {
			lastError = error;
			const httpError = getHttpErrorDetails(error);
			if (httpError && (httpError.status === 503 || httpError.status === 500) && attempt < maxRetries) {
				continue;
			}
			if (httpError) {
				handleHttpError(httpError.status, httpError.text || httpError.message, model);
			}
			throw error;
		}
	}

	if (lastError) {
		const httpError = getHttpErrorDetails(lastError);
		if (httpError) {
			handleHttpError(httpError.status, httpError.text || httpError.message, model);
		}
		if (lastError instanceof Error) throw lastError;
	}

	throw new Error("Failed to communicate with Gemini API.");
}

export function extractTranscription(responseData: unknown): string {
	const data = responseData as GeminiResponse;
	const candidate = data?.candidates?.[0];

	if (!candidate) {
		throw new Error("Gemini returned no response candidates. Please verify image clarity or try another model.");
	}

	if (candidate.finishReason && candidate.finishReason !== "STOP") {
		if (candidate.finishReason === "SAFETY") {
			throw new Error("Gemini blocked the response due to content safety settings.");
		}
		if (candidate.finishReason === "MAX_TOKENS") {
			throw new Error("Gemini stopped before finishing the transcription because the output was too long. Try fewer pages at once.");
		}
		throw new Error(`Gemini did not finish the transcription (${candidate.finishReason})${candidate.finishMessage ? `: ${candidate.finishMessage}` : "."}`);
	}

	const textParts = candidate.content?.parts;
	if (!textParts || textParts.length === 0) {
		throw new Error("Gemini returned an empty transcription response.");
	}

	const fullTranscription = textParts.map((part) => part.text ?? "").join("").trim();
	if (!fullTranscription) {
		throw new Error("Gemini returned an empty transcription response.");
	}
	return fullTranscription;
}

function handleHttpError(status: number, messageText?: string, modelName?: string) {
	if (status === 400) {
		throw new Error(`Gemini API Error (400 Bad Request): The request payload was rejected. ${messageText || ""}`);
	} else if (status === 403) {
		throw new Error("Gemini API Error (403 Forbidden): Invalid API key or permission denied. Please verify your API key.");
	} else if (status === 404) {
		throw new Error(`Gemini API Error (404 Not Found): The model '${modelName || ""}' was not found. Please check your model setting.`);
	} else if (status === 429) {
		throw new Error("Gemini API Error (429 Rate Limit Exceeded): Quota exceeded. Please wait a few moments before trying again.");
	} else if (status === 503) {
		throw new Error(`Gemini API Server Error (503 Service Unavailable): The model '${modelName || ""}' is temporarily overloaded on Google's servers. Please try again in a few moments, or select another current model in settings.`);
	} else if (status >= 500) {
		throw new Error(`Gemini API Server Error (${status}): Google's servers encountered an error. Please try again in a few moments.`);
	} else {
		throw new Error(`Gemini API Error (${status}): ${messageText || "Unknown error occurred"}`);
	}
}

function throwIfCancelled(isCancelled?: () => boolean): void {
	if (isCancelled?.()) {
		throw new TranscriptionCancelledError();
	}
}

function getHttpErrorDetails(error: unknown): HttpErrorDetails | null {
	if (typeof error !== "object" || error === null) return null;

	const candidate = error as { status?: unknown; text?: unknown; message?: unknown };
	if (typeof candidate.status !== "number") return null;

	return {
		status: candidate.status,
		text: typeof candidate.text === "string" ? candidate.text : undefined,
		message: typeof candidate.message === "string" ? candidate.message : undefined,
	};
}
