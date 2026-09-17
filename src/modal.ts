import { App, Modal, Notice, Setting, TFile, arrayBufferToBase64 } from "obsidian";
import type NotebookDigitizerPlugin from "./main";
import { AVAILABLE_MODELS, getEffectiveModel } from "./settings";
import { transcribeImagesWithGemini } from "./gemini";
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
	showKeyInput: boolean = false;
	enablePageBreaks: boolean = false;
	statusMessageEl: HTMLElement | null = null;
	submitButtonEl: HTMLButtonElement | null = null;

	constructor(app: App, plugin: NotebookDigitizerPlugin, initialTargetMode?: "new" | "append") {
		super(app);
		this.plugin = plugin;
		this.activeFile = this.app.workspace.getActiveFile();
		this.enablePageBreaks = this.plugin.settings.enablePageBreaks ?? false;
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

		contentEl.createEl("h2", { text: "Digitize Handwritten Pages", cls: "digitizer-modal-title" });

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
			text: "Specific Instructions (Optional)",
		});
		instructionsSection.createEl("p", {
			cls: "digitizer-field-desc",
			text: "Ask AI to ignore parts, emphasize key points, etc.",
		});
		const instructionsInput = instructionsSection.createEl("textarea", {
			cls: "digitizer-instructions-input",
		});
		instructionsInput.rows = 2;
		instructionsInput.placeholder = "e.g. Ignore pencil doodles at the bottom, keep formulas in LaTeX...";
		instructionsInput.value = this.customInstructions;
		instructionsInput.addEventListener("input", (e) => {
			this.customInstructions = (e.target as HTMLTextAreaElement).value;
		});

		// Destination Settings
		const destinationSection = contentEl.createDiv({ cls: "digitizer-destination-section" });
		destinationSection.createEl("h4", { text: "Destination Note" });

		const modeContainer = destinationSection.createDiv({ cls: "digitizer-mode-options" });

		// Option 1: New note
		const newNoteLabel = modeContainer.createEl("label", { cls: "digitizer-radio-label" });
		const newNoteRadio = newNoteLabel.createEl("input", { type: "radio", value: "new" });
		newNoteRadio.name = "digitizer-target-mode";
		newNoteRadio.checked = this.targetMode === "new";
		newNoteLabel.appendText(" Create New Note");

		// Title input for new note
		const titleInputContainer = destinationSection.createDiv({ cls: "digitizer-title-container" });
		titleInputContainer.createEl("label", {
			cls: "digitizer-field-label",
			text: "Note Title",
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
			appendLabel.appendText(` Append to Active Note: "${this.activeFile.basename}"`);
		} else {
			appendLabel.appendText(" Append to Active Note (No markdown note currently open)");
			appendRadio.disabled = true;
		}

		newNoteRadio.addEventListener("change", () => {
			this.targetMode = "new";
			titleInputContainer.style.display = "block";
		});

		appendRadio.addEventListener("change", () => {
			this.targetMode = "append";
			titleInputContainer.style.display = "none";
		});

		if (this.targetMode === "append") {
			titleInputContainer.style.display = "none";
		}

		// Options section (Page Breaks and Image Compression toggles)
		const optionsSection = contentEl.createDiv({ cls: "digitizer-options-section" });

		// Page Breaks toggle
		const pageBreakLabel = optionsSection.createEl("label", { cls: "digitizer-checkbox-label" });
		const pageBreakCheckbox = pageBreakLabel.createEl("input", { type: "checkbox" });
		pageBreakCheckbox.checked = this.enablePageBreaks;
		pageBreakLabel.appendText(" Separate pages with page breaks");

		const pageBreakDesc = optionsSection.createEl("p", {
			cls: "digitizer-checkbox-desc",
			text: "Disabled by default: combines multiple pages into one continuous note without dividers.",
		});

		pageBreakCheckbox.addEventListener("change", async () => {
			this.enablePageBreaks = pageBreakCheckbox.checked;
			this.plugin.settings.enablePageBreaks = this.enablePageBreaks;
			await this.plugin.saveSettings();
		});

		// Status and Progress
		this.statusMessageEl = contentEl.createDiv({ cls: "digitizer-status-message" });

		// Action buttons
		const buttonContainer = contentEl.createDiv({ cls: "digitizer-button-bar" });

		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		this.submitButtonEl = buttonContainer.createEl("button", {
			text: "Digitize & Transcribe",
			cls: "mod-cta digitizer-submit-btn",
		});
		this.submitButtonEl.addEventListener("click", () => this.handleProcess());
	}

	renderApiKeySection(parentEl: HTMLElement): void {
		if (!this.plugin.settings.apiKey || this.showKeyInput) {
			const keyCard = parentEl.createDiv({ cls: "digitizer-key-card" });
			const header = keyCard.createDiv({ cls: "digitizer-key-header" });
			header.createEl("strong", { text: "🔑 Your Personal Gemini API Key" });

			const desc = keyCard.createEl("p", { cls: "digitizer-key-desc" });
			desc.createSpan({ text: "Provide your own free Google Gemini API key. Keys are saved locally in your vault. " });
			const link = desc.createEl("a", {
				text: "Get free key from Google AI Studio",
				href: "https://aistudio.google.com/app/apikey",
			});
			link.setAttr("target", "_blank");

			const inputRow = keyCard.createDiv({ cls: "digitizer-key-input-row" });
			const keyInput = inputRow.createEl("input", {
				type: "password",
				placeholder: "Paste your API key here (AIzaSy...)",
				cls: "digitizer-key-input",
			});
			keyInput.value = this.plugin.settings.apiKey;

			const saveKeyBtn = inputRow.createEl("button", {
				text: "Save Key",
				cls: "mod-cta digitizer-save-key-btn",
			});

			saveKeyBtn.addEventListener("click", async () => {
				const val = keyInput.value.trim();
				if (val) {
					this.plugin.settings.apiKey = val;
					await this.plugin.saveSettings();
					this.showKeyInput = false;
					new Notice("Personal Gemini API key saved!");
					this.onOpen();
				} else {
					new Notice("Please enter a valid API key.");
				}
			});

			if (this.plugin.settings.apiKey && this.showKeyInput) {
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
				text: `🔑 Key: ••••${this.plugin.settings.apiKey.slice(-4)} `,
				cls: "digitizer-key-status-text",
			});
			const changeLink = keyInfo.createEl("a", { text: "(edit)", cls: "digitizer-change-key-link" });
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
			modelSelect.addEventListener("change", async () => {
				this.plugin.settings.model = modelSelect.value;
				await this.plugin.saveSettings();
				new Notice(`Switched model to ${modelSelect.value}`);
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
			text: "📁 Choose Images",
			cls: "digitizer-btn",
		});
		selectFilesBtn.addEventListener("click", () => fileInput.click());

		// Camera button
		const cameraBtn = uploadBar.createEl("button", {
			text: "📷 Capture with Camera",
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
		dropZone.createEl("span", { text: "Or drag & drop notebook page images here" });

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
				id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

			const badge = card.createDiv({ cls: "digitizer-page-badge", text: `Page ${index + 1}` });

			const imgEl = card.createEl("img", { cls: "digitizer-thumb" });
			imgEl.src = img.previewUrl;

			const info = card.createDiv({ cls: "digitizer-card-info" });
			info.createEl("span", { cls: "digitizer-card-name", text: img.name });

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

		if (!this.plugin.settings.apiKey) {
			new Notice("Please set your Gemini API key first.");
			return;
		}

		this.setLoading(true, "Optimizing and encoding images...");

		try {
			// Always optimize images for OCR (downscales to max 1920px & compresses to efficient JPEG)
			const preparedImages: PreparedImage[] = [];
			for (let i = 0; i < this.selectedImages.length; i++) {
				const item = this.selectedImages[i];
				this.updateStatus(`Optimizing page ${i + 1} of ${this.selectedImages.length}...`);
				const opt = await optimizeImageForOcr(item.file);
				preparedImages.push({
					name: getOptimizedFileName(item.file.name),
					mimeType: opt.mimeType,
					arrayBuffer: opt.arrayBuffer,
					base64Data: opt.base64Data,
				});
			}

			// 1. Determine note folder location
			let noteFolderPath = "";
			if (this.targetMode === "append" && this.activeFile) {
				noteFolderPath = this.activeFile.parent?.path || "";
			} else {
				const parentFolder = this.app.fileManager.getNewFileParent(this.activeFile ? this.activeFile.path : "");
				noteFolderPath = parentFolder && parentFolder.path !== "/" ? parentFolder.path : "";
			}

			// 2. Save page images into 'scans' subfolder
			this.updateStatus("Saving page images to scans subfolder...");
			const savedTFiles = await saveImagesToVault(
				this.app,
				preparedImages,
				this.plugin.settings,
				noteFolderPath
			);

			// 3. Call Gemini API
			const effectiveModel = getEffectiveModel(this.plugin.settings);
			this.updateStatus(`Transcribing ${preparedImages.length} page(s) with ${effectiveModel}...`);
			const transcription = await transcribeImagesWithGemini({
				apiKey: this.plugin.settings.apiKey,
				model: effectiveModel,
				images: preparedImages.map((p) => ({
					mimeType: p.mimeType,
					base64Data: p.base64Data,
				})),
				userCustomPrompt: this.plugin.settings.customPrompt,
				noteSpecificInstruction: this.customInstructions,
				enablePageBreaks: this.enablePageBreaks,
			});

			// 4. Format note with collapsible callouts
			this.updateStatus("Building note and embedding scans...");
			const targetPath = this.targetMode === "append" && this.activeFile
				? this.activeFile.path
				: (noteFolderPath ? `${noteFolderPath}/note.md` : "note.md");

			const formattedContent = formatNoteWithCallouts(
				this.app,
				transcription,
				savedTFiles,
				{ ...this.plugin.settings, enablePageBreaks: this.enablePageBreaks },
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
			this.close();
		} catch (error: any) {
			console.error("Transcription error:", error);
			this.setLoading(false);
			const errMsg = error.message || "An unexpected error occurred during transcription.";
			if (this.statusMessageEl) {
				this.statusMessageEl.empty();
				this.statusMessageEl.createEl("span", {
					cls: "digitizer-error-text",
					text: `Error: ${errMsg}`,
				});
			}
			new Notice(`Transcription failed: ${errMsg}`);
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
			this.submitButtonEl.setText(loading ? "Processing..." : "Digitize & Transcribe");
		}
		if (loading) {
			this.updateStatus(msg);
		}
	}

	onClose(): void {
		// Clean up object URLs to prevent memory leaks
		this.selectedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
		this.selectedImages = [];
		const { contentEl } = this;
		contentEl.empty();
	}
}

function getOptimizedFileName(originalName: string): string {
	const lastDot = originalName.lastIndexOf(".");
	const base = lastDot !== -1 ? originalName.substring(0, lastDot) : originalName;
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
	return new Promise((resolve) => {
		const img = new Image();
		const objectUrl = URL.createObjectURL(file);

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

			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				fallbackRead(file).then(resolve);
				return;
			}

			ctx.drawImage(img, 0, 0, width, height);

			canvas.toBlob(
				async (blob) => {
					if (!blob) {
						fallbackRead(file).then(resolve);
						return;
					}
					const arrayBuffer = await blob.arrayBuffer();
					resolve({
						arrayBuffer,
						base64Data: arrayBufferToBase64(arrayBuffer),
						mimeType: "image/jpeg",
					});
				},
				"image/jpeg",
				quality
			);
		};

		img.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			fallbackRead(file).then(resolve);
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
