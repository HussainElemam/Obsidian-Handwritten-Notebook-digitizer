import { App, Modal, Notice, TFile, arrayBufferToBase64 } from "obsidian";
import type NotebookDigitizerPlugin from "./main";
import { AVAILABLE_MODELS, getEffectiveModel } from "./settings";
import { TranscriptionCancelledError, transcribeImagesWithGemini } from "./gemini";
import { PreparedImage, formatNoteWithCallouts, saveImagesToVault, writeNoteContent } from "./noteBuilder";

interface SelectedImageItem {
	id: string;
	file: File;
	previewUrl: string;
	name: string;
}

export class DigitizeModal extends Modal {
	plugin: NotebookDigitizerPlugin;
	selectedImages: SelectedImageItem[] = [];
	customInstructions: string = "";
	targetMode: "new" | "append" = "new";
	newNoteTitle: string = "";
	activeFile: TFile | null = null;
	isProcessing: boolean = false;
	isCancelled: boolean = false;
	showKeyInput: boolean = false;
	enablePageBreaks: boolean = false;
	embedCallouts: boolean = true;
	statusMessageEl: HTMLElement | null = null;
	submitButtonEl: HTMLButtonElement | null = null;

	constructor(app: App, plugin: NotebookDigitizerPlugin, initialTargetMode?: "new" | "append") {
		super(app);
		this.plugin = plugin;
		this.activeFile = this.app.workspace.getActiveFile();
		this.enablePageBreaks = this.plugin.settings.enablePageBreaks ?? false;
		this.embedCallouts = this.plugin.settings.embedCallouts ?? true;
		if (initialTargetMode) {
			this.targetMode = initialTargetMode;
		} else if (this.activeFile && this.activeFile.extension === "md") {
			// Default to append if a note is currently open, or let user toggle
			this.targetMode = "new";
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("notebook-digitizer-modal-window");
		contentEl.addClass("notebook-digitizer-modal");

		contentEl.createEl("h2", { text: "Digitize handwritten pages", cls: "digitizer-modal-title" });

		// Personal API Key section
		this.renderApiKeySection(contentEl);

		// Image upload and capture section
		this.renderUploadControls(contentEl);

		// Image previews gallery
		const galleryContainer = contentEl.createDiv({ cls: "digitizer-gallery-container" });
		this.renderGallery(galleryContainer);

		// Instructions input
		const instructionsSection = contentEl.createDiv({ cls: "digitizer-field-section" });
		instructionsSection.createEl("label", {
			cls: "digitizer-field-label",
			text: "Specific instructions (optional)",
		});
		instructionsSection.createEl("p", {
			cls: "digitizer-field-desc",
			text: "Ask AI to ignore parts, emphasize key points, etc.",
		});
		const instructionsInput = instructionsSection.createEl("textarea", {
			cls: "digitizer-instructions-input",
		});
		instructionsInput.rows = 2;
		instructionsInput.placeholder = "Ignore pencil doodles at the bottom, keep formulas in LaTeX...";
		instructionsInput.value = this.customInstructions;
		instructionsInput.addEventListener("input", (e) => {
			this.customInstructions = (e.target as HTMLTextAreaElement).value;
		});

		// Destination Settings
		const destinationSection = contentEl.createDiv({ cls: "digitizer-destination-section" });
		destinationSection.createEl("h4", { text: "Destination note" });

		const modeContainer = destinationSection.createDiv({ cls: "digitizer-mode-options" });

		// Option 1: New note
		const newNoteLabel = modeContainer.createEl("label", { cls: "digitizer-radio-label" });
		const newNoteRadio = newNoteLabel.createEl("input", { type: "radio", value: "new" });
		newNoteRadio.name = "digitizer-target-mode";
		newNoteRadio.checked = this.targetMode === "new";
		newNoteLabel.appendText(" Create new note");

		// Title input for new note
		const titleInputContainer = destinationSection.createDiv({ cls: "digitizer-title-container" });
		titleInputContainer.createEl("label", {
			cls: "digitizer-field-label",
			text: "Note title",
		});
		const titleInput = titleInputContainer.createEl("input", {
			type: "text",
			cls: "digitizer-title-input",
		});
		titleInput.placeholder = `e.g. Lecture Notes - ${new Date().toISOString().slice(0, 10)}`;
		titleInput.value = this.newNoteTitle;
		titleInput.addEventListener("input", (e) => {
			this.newNoteTitle = (e.target as HTMLInputElement).value;
		});

		// Option 2: Append to active note
		const appendLabel = modeContainer.createEl("label", { cls: "digitizer-radio-label" });
		const appendRadio = appendLabel.createEl("input", { type: "radio", value: "append" });
		appendRadio.name = "digitizer-target-mode";
		appendRadio.checked = this.targetMode === "append";

		if (this.activeFile && this.activeFile.extension === "md") {
			appendLabel.appendText(` Append to active note: "${this.activeFile.basename}"`);
		} else {
			appendLabel.appendText(" Append to active note (no Markdown note currently open)");
			appendRadio.disabled = true;
		}

		newNoteRadio.addEventListener("change", () => {
			this.targetMode = "new";
			titleInputContainer.removeClass("digitizer-hidden");
		});

		appendRadio.addEventListener("change", () => {
			this.targetMode = "append";
			titleInputContainer.addClass("digitizer-hidden");
		});

		if (this.targetMode === "append") {
			titleInputContainer.addClass("digitizer-hidden");
		}

		// Options section (Callouts and Page Breaks toggles)
		const optionsSection = contentEl.createDiv({ cls: "digitizer-options-section" });

		// Callout with original scan toggle
		const calloutLabel = optionsSection.createEl("label", { cls: "digitizer-checkbox-label" });
		const calloutCheckbox = calloutLabel.createEl("input", { type: "checkbox" });
		calloutCheckbox.checked = this.embedCallouts;
		calloutLabel.appendText(" Add callout with original scan");

		optionsSection.createEl("p", {
			cls: "digitizer-checkbox-desc",
			text: "Embeds original page scan inside a collapsible callout for easy proofreading.",
		});

		calloutCheckbox.addEventListener("change", () => {
			this.embedCallouts = calloutCheckbox.checked;
			this.plugin.settings.embedCallouts = this.embedCallouts;
			void this.plugin.saveSettings().catch((error: unknown) => console.error("Failed to save callout setting:", error));
		});

		// Page Breaks toggle
		const pageBreakLabel = optionsSection.createEl("label", { cls: "digitizer-checkbox-label" });
		const pageBreakCheckbox = pageBreakLabel.createEl("input", { type: "checkbox" });
		pageBreakCheckbox.checked = this.enablePageBreaks;
		pageBreakLabel.appendText(" Separate pages with page breaks");

		optionsSection.createEl("p", {
			cls: "digitizer-checkbox-desc",
			text: "Disabled by default: combines multiple pages into one continuous note without dividers.",
		});

		pageBreakCheckbox.addEventListener("change", () => {
			this.enablePageBreaks = pageBreakCheckbox.checked;
			this.plugin.settings.enablePageBreaks = this.enablePageBreaks;
			void this.plugin.saveSettings().catch((error: unknown) => console.error("Failed to save page-break setting:", error));
		});

		// Status and Progress
		this.statusMessageEl = contentEl.createDiv({ cls: "digitizer-status-message" });

		// Action buttons
		const buttonContainer = contentEl.createDiv({ cls: "digitizer-button-bar" });

		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.isCancelled = true;
			this.close();
		});

		this.submitButtonEl = buttonContainer.createEl("button", {
			text: "Digitize & transcribe",
			cls: "mod-cta digitizer-submit-btn",
		});
		this.submitButtonEl.addEventListener("click", () => {
			void this.handleProcess().catch((error: unknown) => console.error("Unexpected processing error:", error));
		});
	}

	renderApiKeySection(parentEl: HTMLElement): void {
		const apiKey = this.plugin.getApiKey();
		if (!apiKey || this.showKeyInput) {
			const keyCard = parentEl.createDiv({ cls: "digitizer-key-card" });
			const header = keyCard.createDiv({ cls: "digitizer-key-header" });
			header.createEl("strong", { text: "🔑 Your personal Gemini API key" });

			const desc = keyCard.createEl("p", { cls: "digitizer-key-desc" });
			desc.createSpan({ text: "The key is stored with Obsidian's SecretStorage API. " });
			const link = desc.createEl("a", {
				text: "Get a key from Google AI Studio",
				href: "https://aistudio.google.com/app/apikey",
			});
			link.setAttr("target", "_blank");

			const inputRow = keyCard.createDiv({ cls: "digitizer-key-input-row" });
			const keyInput = inputRow.createEl("input", {
				type: "password",
				placeholder: "Paste your API key here (AIzaSy...)",
				cls: "digitizer-key-input",
			});
			keyInput.value = "";

			const saveKeyBtn = inputRow.createEl("button", {
				text: "Save key",
				cls: "mod-cta digitizer-save-key-btn",
			});

			saveKeyBtn.addEventListener("click", () => {
				const val = keyInput.value.trim();
				if (val) {
					void this.plugin.setApiKey(val)
						.then(() => {
							this.showKeyInput = false;
							new Notice("Gemini API key saved.");
							this.onOpen();
						})
						.catch((error: unknown) => {
							console.error("Failed to save Gemini API key:", error);
							new Notice("Failed to save the Gemini API key.");
						});
				} else {
					new Notice("Please enter a valid API key.");
				}
			});

			if (apiKey && this.showKeyInput) {
				const cancelBtn = inputRow.createEl("button", { text: "Cancel" });
				cancelBtn.addEventListener("click", () => {
					this.showKeyInput = false;
					this.onOpen();
				});
			}
		} else {
			const statusRow = parentEl.createDiv({ cls: "digitizer-key-status-row" });
			const keyInfo = statusRow.createDiv({ cls: "digitizer-key-info-left" });
			keyInfo.createSpan({
				text: `🔑 Key: ••••${apiKey.slice(-4)} `,
				cls: "digitizer-key-status-text",
			});
			const changeLink = keyInfo.createEl("a", { text: "(Edit)", cls: "digitizer-change-key-link" });
			changeLink.addEventListener("click", (e) => {
				e.preventDefault();
				this.showKeyInput = true;
				this.onOpen();
			});

			const modelWrap = statusRow.createDiv({ cls: "digitizer-model-select-wrap" });
			modelWrap.createSpan({ text: "Model: ", cls: "digitizer-model-label" });
			const modelSelect = modelWrap.createEl("select", { cls: "digitizer-model-select" });
			for (const m of AVAILABLE_MODELS) {
				const opt = modelSelect.createEl("option", { value: m.id, text: m.name });
				if (m.id === this.plugin.settings.model) opt.selected = true;
			}
			modelSelect.addEventListener("change", () => {
				this.plugin.settings.model = modelSelect.value;
				void this.plugin.saveSettings()
					.then(() => new Notice(`Switched model to ${modelSelect.value}`))
					.catch((error: unknown) => console.error("Failed to save model setting:", error));
			});
		}
	}

	renderUploadControls(parentEl: HTMLElement): void {
		const uploadBar = parentEl.createDiv({ cls: "digitizer-upload-bar" });

		// Hidden file input for general file picking
		const fileInput = uploadBar.createEl("input", {
			type: "file",
			cls: "digitizer-hidden-input",
		});
		fileInput.multiple = true;
		fileInput.accept = "image/*";

		// Hidden file input for mobile camera capture
		const cameraInput = uploadBar.createEl("input", {
			type: "file",
			cls: "digitizer-hidden-input",
		});
		cameraInput.accept = "image/*";
		cameraInput.setAttribute("capture", "environment");

		// File picker button
		const selectFilesBtn = uploadBar.createEl("button", {
			text: "📁 Choose images",
			cls: "digitizer-btn",
		});
		selectFilesBtn.addEventListener("click", () => fileInput.click());

		// Camera button
		const cameraBtn = uploadBar.createEl("button", {
			text: "📷 Capture with camera",
			cls: "digitizer-btn",
		});
		cameraBtn.addEventListener("click", () => cameraInput.click());

		const fileHandler = (e: Event) => {
			const target = e.target as HTMLInputElement;
			if (target.files && target.files.length > 0) {
				this.addFiles(Array.from(target.files));
				target.value = ""; // Reset
			}
		};

		fileInput.addEventListener("change", fileHandler);
		cameraInput.addEventListener("change", fileHandler);

		// Drag and drop zone
		const dropZone = parentEl.createDiv({ cls: "digitizer-drop-zone" });
		dropZone.createSpan({ text: "Or drag & drop notebook page images here" });

		dropZone.addEventListener("dragover", (e) => {
			e.preventDefault();
			dropZone.addClass("drag-over");
		});
		dropZone.addEventListener("dragleave", () => {
			dropZone.removeClass("drag-over");
		});
		dropZone.addEventListener("drop", (e) => {
			e.preventDefault();
			dropZone.removeClass("drag-over");
			if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
				const imageFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
				if (imageFiles.length > 0) {
					this.addFiles(imageFiles);
				} else {
					new Notice("Please drop valid image files (JPG, PNG, WebP).");
				}
			}
		});
	}

	addFiles(files: File[]): void {
		for (const file of files) {
			const item: SelectedImageItem = {
				id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
				file: file,
				previewUrl: URL.createObjectURL(file),
				name: file.name,
			};
			this.selectedImages.push(item);
		}

		// Re-render gallery
		const gallery = this.contentEl.querySelector(".digitizer-gallery-container") as HTMLElement;
		if (gallery) {
			this.renderGallery(gallery);
		}
	}

	renderGallery(container: HTMLElement): void {
		container.empty();

		if (this.selectedImages.length === 0) {
			container.createDiv({
				text: "No images selected yet. Choose 1–3 pages from notebook.",
				cls: "digitizer-gallery-empty",
			});
			return;
		}

		const list = container.createDiv({ cls: "digitizer-gallery-list" });

		this.selectedImages.forEach((img, index) => {
			const card = list.createDiv({ cls: "digitizer-image-card" });

			card.createDiv({ cls: "digitizer-page-badge", text: `Page ${index + 1}` });

			const imgEl = card.createEl("img", { cls: "digitizer-thumb" });
			imgEl.src = img.previewUrl;

			const info = card.createDiv({ cls: "digitizer-card-info" });
			info.createSpan({ cls: "digitizer-card-name", text: img.name });

			const cardActions = card.createDiv({ cls: "digitizer-card-actions" });

			if (index > 0) {
				const moveLeftBtn = cardActions.createEl("button", { text: "◀", cls: "digitizer-icon-btn" });
				moveLeftBtn.title = "Move page earlier";
				moveLeftBtn.addEventListener("click", () => {
					const temp = this.selectedImages[index - 1];
					this.selectedImages[index - 1] = this.selectedImages[index];
					this.selectedImages[index] = temp;
					this.renderGallery(container);
				});
			}

			if (index < this.selectedImages.length - 1) {
				const moveRightBtn = cardActions.createEl("button", { text: "▶", cls: "digitizer-icon-btn" });
				moveRightBtn.title = "Move page later";
				moveRightBtn.addEventListener("click", () => {
					const temp = this.selectedImages[index + 1];
					this.selectedImages[index + 1] = this.selectedImages[index];
					this.selectedImages[index] = temp;
					this.renderGallery(container);
				});
			}

			const removeBtn = cardActions.createEl("button", { text: "✕", cls: "digitizer-icon-btn digitizer-remove-btn" });
			removeBtn.title = "Remove page";
			removeBtn.addEventListener("click", () => {
				URL.revokeObjectURL(img.previewUrl);
				this.selectedImages.splice(index, 1);
				this.renderGallery(container);
			});
		});
	}

	async handleProcess(): Promise<void> {
		if (this.isProcessing) return;

		if (this.selectedImages.length === 0) {
			new Notice("Please select or capture at least one notebook page image.");
			return;
		}

		const apiKey = this.plugin.getApiKey();
		if (!apiKey) {
			new Notice("Please set your Gemini API key first.");
			return;
		}

		this.isCancelled = false;
		this.setLoading(true, "Optimizing and encoding images...");
		let savedTFiles: TFile[] = [];
		let noteWritten = false;

		try {
			// Always optimize images for OCR (downscales to max 1920px & compresses to efficient JPEG)
			const preparedImages: PreparedImage[] = [];
			for (let i = 0; i < this.selectedImages.length; i++) {
				const item = this.selectedImages[i];
				this.updateStatus(`Optimizing page ${i + 1} of ${this.selectedImages.length}...`);
				const opt = await optimizeImageForOcr(item.file);
				this.throwIfCancelled();
				preparedImages.push({
					name: getOptimizedFileName(item.file.name),
					mimeType: opt.mimeType,
					arrayBuffer: opt.arrayBuffer,
					base64Data: opt.base64Data,
				});
			}

			// 1. Call Gemini before changing the vault.
			const effectiveModel = getEffectiveModel(this.plugin.settings);
			this.updateStatus(`Transcribing ${preparedImages.length} page(s) with ${effectiveModel}...`);
			const transcription = await transcribeImagesWithGemini({
				apiKey,
				model: effectiveModel,
				images: preparedImages.map((p) => ({
					mimeType: p.mimeType,
					base64Data: p.base64Data,
				})),
				userCustomPrompt: this.plugin.settings.customPrompt,
				noteSpecificInstruction: this.customInstructions,
				enablePageBreaks: this.enablePageBreaks,
				isCancelled: () => this.isCancelled,
			});
			this.throwIfCancelled();

			// 2. Determine note folder location.
			let noteFolderPath = "";
			if (this.targetMode === "append" && this.activeFile) {
				noteFolderPath = this.activeFile.parent?.path || "";
			} else {
				const parentFolder = this.app.fileManager.getNewFileParent(this.activeFile ? this.activeFile.path : "");
				noteFolderPath = parentFolder && parentFolder.path !== "/" ? parentFolder.path : "";
			}

			// 3. Save page images only after transcription succeeds.
			if (this.embedCallouts) {
				this.updateStatus("Saving page images to scans subfolder...");
				savedTFiles = await saveImagesToVault(
					this.app,
					preparedImages,
					this.plugin.settings,
					noteFolderPath
				);
				this.throwIfCancelled();
			}

			// 4. Format note with collapsible callouts
			this.updateStatus("Building note...");
			const targetPath = this.targetMode === "append" && this.activeFile
				? this.activeFile.path
				: (noteFolderPath ? `${noteFolderPath}/note.md` : "note.md");

			const formattedContent = formatNoteWithCallouts(
				this.app,
				transcription,
				savedTFiles,
				{
					...this.plugin.settings,
					enablePageBreaks: this.enablePageBreaks,
					embedCallouts: this.embedCallouts,
				},
				targetPath
			);

			// 5. Write to vault (new note or append)
			const result = await writeNoteContent(
				this.app,
				formattedContent,
				this.targetMode,
				this.activeFile,
				this.newNoteTitle,
				noteFolderPath
			);
			noteWritten = true;

			// Open or refresh view
			if (result.isNewFile) {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(result.targetFile);
				new Notice(`Created new note: "${result.targetFile.basename}"`);
			} else {
				new Notice(`Appended digitized pages to "${result.targetFile.basename}"`);
			}

			// Clean up object URLs
			this.selectedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
			this.isProcessing = false;
			this.close();
		} catch (error: unknown) {
			if (!noteWritten && savedTFiles.length > 0) {
				await cleanupSavedFiles(this.app, savedTFiles);
			}
			if (error instanceof TranscriptionCancelledError) {
				return;
			}
			console.error("Transcription error:", error);
			this.setLoading(false);
			const errMsg = error instanceof Error ? error.message : "An unexpected error occurred during transcription.";
			if (this.statusMessageEl) {
				this.statusMessageEl.empty();
				this.statusMessageEl.createSpan({
					cls: "digitizer-error-text",
					text: `Error: ${errMsg}`,
				});
			}
			new Notice(`Transcription failed: ${errMsg}`);
		}
	}

	throwIfCancelled(): void {
		if (this.isCancelled) {
			throw new TranscriptionCancelledError();
		}
	}

	updateStatus(msg: string): void {
		if (this.statusMessageEl) {
			this.statusMessageEl.empty();
			this.statusMessageEl.createDiv({ cls: "digitizer-loading-spinner" });
			this.statusMessageEl.createSpan({ text: msg, cls: "digitizer-loading-text" });
		}
	}

	setLoading(loading: boolean, msg: string = ""): void {
		this.isProcessing = loading;
		if (this.submitButtonEl) {
			this.submitButtonEl.disabled = loading;
			this.submitButtonEl.setText(loading ? "Processing..." : "Digitize & transcribe");
		}
		if (loading) {
			this.updateStatus(msg);
		}
	}

	onClose(): void {
		if (this.isProcessing) {
			this.isCancelled = true;
		}
		// Clean up object URLs to prevent memory leaks
		this.selectedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
		this.selectedImages = [];
		const { contentEl } = this;
		contentEl.empty();
	}
}

async function cleanupSavedFiles(app: App, files: TFile[]): Promise<void> {
	for (const file of files) {
		try {
			if (app.vault.getFileByPath(file.path)) {
				await app.fileManager.trashFile(file);
			}
		} catch (error) {
			console.error(`Failed to clean up scan file: ${file.path}`, error);
		}
	}
}

function getOptimizedFileName(originalName: string): string {
	const lastDot = originalName.lastIndexOf(".");
	const originalBase = lastDot !== -1 ? originalName.substring(0, lastDot) : originalName;
	const base = originalBase
		.split("")
		.filter((character) => character.charCodeAt(0) >= 32)
		.join("")
		.replace(/[\\/:*?"<>|]/g, "-")
		.replace(/[. ]+$/g, "")
		.trim()
		.slice(0, 180) || "scan";
	return `${base}.jpg`;
}

/**
 * Client-side optimization: downscales high-res photos to prevent huge base64 payloads
 * and Gemini 503 gateway timeouts while preserving handwriting readability.
 */
async function optimizeImageForOcr(
	file: File,
	maxDimension: number = 1920,
	quality: number = 0.85
): Promise<{ arrayBuffer: ArrayBuffer; base64Data: string; mimeType: string }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const objectUrl = URL.createObjectURL(file);
		const resolveFallback = () => {
			void fallbackRead(file).then(resolve).catch(reject);
		};

		img.onload = () => {
			URL.revokeObjectURL(objectUrl);
			let { width, height } = img;

			if (width > maxDimension || height > maxDimension) {
				if (width > height) {
					height = Math.round((height * maxDimension) / width);
					width = maxDimension;
				} else {
					width = Math.round((width * maxDimension) / height);
					height = maxDimension;
				}
			}

			const canvas = createEl("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				resolveFallback();
				return;
			}

			ctx.drawImage(img, 0, 0, width, height);

			canvas.toBlob(
				(blob) => {
					if (!blob) {
						resolveFallback();
						return;
					}
					void blob.arrayBuffer()
						.then((arrayBuffer) => {
							resolve({
								arrayBuffer,
								base64Data: arrayBufferToBase64(arrayBuffer),
								mimeType: "image/jpeg",
							});
						})
						.catch(reject);
				},
				"image/jpeg",
				quality
			);
		};

		img.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			resolveFallback();
		};

		img.src = objectUrl;
	});
}

async function fallbackRead(file: File): Promise<{ arrayBuffer: ArrayBuffer; base64Data: string; mimeType: string }> {
	const arrayBuffer = await file.arrayBuffer();
	return {
		arrayBuffer,
		base64Data: arrayBufferToBase64(arrayBuffer),
		mimeType: file.type || "image/jpeg",
	};
}
