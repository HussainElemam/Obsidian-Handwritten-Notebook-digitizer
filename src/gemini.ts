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
}

export async function transcribeImagesWithGemini(request: TranscriptionRequest): Promise<string> {
	const { apiKey, model, images, userCustomPrompt, noteSpecificInstruction, enablePageBreaks } = request;

	if (!apiKey || apiKey.trim().length === 0) {
		throw new Error("Gemini API key is not configured. Please add your API key in Settings > Handwritten Notebook Digitizer.");
	}

	if (!images || images.length === 0) {
		throw new Error("No images provided for transcription.");
	}

	const promptText = buildSystemPrompt(userCustomPrompt, noteSpecificInstruction, !!enablePageBreaks);

	const parts: any[] = [
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

	const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

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

	let lastError: any = null;
	const maxRetries = 2;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			if (attempt > 0) {
				// Wait with backoff before retry (1.5s, 3s)
				await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
			}

			const response = await requestUrl({
				url: endpoint,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
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

			const data = response.json;
			const candidate = data?.candidates?.[0];

			if (!candidate) {
				throw new Error("Gemini returned no response candidates. Please verify image clarity or try another model.");
			}

			if (candidate.finishReason === "SAFETY") {
				throw new Error("Gemini blocked the response due to content safety settings.");
			}

			const textParts = candidate.content?.parts;
			if (!textParts || textParts.length === 0) {
				throw new Error("Gemini returned an empty transcription response.");
			}

			let fullTranscription = "";
			for (const part of textParts) {
				if (part.text) {
					fullTranscription += part.text;
				}
			}

			return fullTranscription.trim();
		} catch (error: any) {
			lastError = error;
			if ((error.status === 503 || error.status === 500) && attempt < maxRetries) {
				continue;
			}
			if (error.status) {
				handleHttpError(error.status, error.text || error.message, model);
			}
			throw error;
		}
	}

	if (lastError) {
		if (lastError.status) {
			handleHttpError(lastError.status, lastError.text || lastError.message, model);
		}
		throw lastError;
	}

	throw new Error("Failed to communicate with Gemini API.");
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
		throw new Error(`Gemini API Server Error (503 Service Unavailable): The model '${modelName || ""}' is temporarily overloaded on Google's servers. Please try again in a few moments, or select another model in settings (e.g. Gemini 2.0 Flash or Gemini 1.5 Flash).`);
	} else if (status >= 500) {
		throw new Error(`Gemini API Server Error (${status}): Google's servers encountered an error. Please try again in a few moments.`);
	} else {
		throw new Error(`Gemini API Error (${status}): ${messageText || "Unknown error occurred"}`);
	}
}

