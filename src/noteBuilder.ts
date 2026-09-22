import { App, TFile, normalizePath } from "obsidian";
import { NotebookDigitizerSettings } from "./settings";

export interface PreparedImage {
	name: string;
	mimeType: string;
	arrayBuffer: ArrayBuffer;
	base64Data: string;
}

export interface AssembledNoteResult {
	targetFile: TFile;
	isNewFile: boolean;
}

export async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const normalized = normalizePath(folderPath);
	if (!normalized || normalized === "/" || normalized === ".") return;

	const parts = normalized.split("/").filter((p) => p.length > 0);
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(current);
		if (!existing) {
			await app.vault.createFolder(current);
		}
	}
}

/**
 * Saves uploaded images into a 'scans' subfolder under the note's directory (or custom folder).
 * Returns array of saved TFiles.
 */
export async function saveImagesToVault(
	app: App,
	images: PreparedImage[],
	settings: NotebookDigitizerSettings,
	noteFolderPath?: string
): Promise<TFile[]> {
	const savedFiles: TFile[] = [];
	const subfolderSetting = (settings.attachmentFolder || "").trim() || "scans";

	let targetFolder: string;
	const cleanParent = (!noteFolderPath || noteFolderPath === "/") ? "" : normalizePath(noteFolderPath);

	if (subfolderSetting.startsWith("/")) {
		// Vault-root absolute path
		targetFolder = normalizePath(subfolderSetting.substring(1));
	} else if (subfolderSetting.includes("/")) {
		// Specific subpath
		targetFolder = normalizePath(subfolderSetting);
	} else {
		// Relative to note folder (e.g. NoteFolder/scans or scans at root)
		targetFolder = cleanParent ? normalizePath(`${cleanParent}/${subfolderSetting}`) : subfolderSetting;
	}

	await ensureFolderExists(app, targetFolder);

	for (let i = 0; i < images.length; i++) {
		const img = images[i];
		let targetPath = normalizePath(`${targetFolder}/${img.name}`);

		// Avoid overwriting existing files if name clashes
		targetPath = getUniqueFilePath(app, targetPath);

		const createdFile = await app.vault.createBinary(targetPath, img.arrayBuffer);
		savedFiles.push(createdFile);
	}

	return savedFiles;
}

/**
 * Formats the extracted Markdown with collapsible image callouts.
 */
export function formatNoteWithCallouts(
	app: App,
	transcription: string,
	savedFiles: TFile[],
	settings: NotebookDigitizerSettings,
	sourcePath: string
): string {
	const calloutTitle = settings.calloutTitle || "Original Scan";

	// If page breaks are enabled, format per page
	if (settings.enablePageBreaks) {
		const pageBreakRegex = /<!--\s*(?:PAGE_BREAK|PAGE)\s*:\s*(?:Page\s*)?(\d+)\s*-->/gi;
		const matches = [...transcription.matchAll(pageBreakRegex)];

		if (matches.length > 0) {
			const sections: string[] = [];

			// Preserve any title/preamble text before the first page break
			const preamble = transcription.substring(0, matches[0].index!).trim();
			if (preamble.length > 0) {
				sections.push(preamble);
			}

			for (let i = 0; i < matches.length; i++) {
				const match = matches[i];
				const pageNum = parseInt(match[1], 10);
				const startIndex = match.index! + match[0].length;
				const endIndex = i + 1 < matches.length ? matches[i + 1].index! : transcription.length;
				const pageText = transcription.substring(startIndex, endIndex).trim();

				const fileIndex = pageNum - 1;
				const file = fileIndex < savedFiles.length ? savedFiles[fileIndex] : null;

				let pageBlock = "";
				if (settings.embedCallouts && file) {
					const link = app.fileManager.generateMarkdownLink(file, sourcePath);
					const title = `${calloutTitle} (Page ${pageNum})`;
					pageBlock += `> [!info]- ${title}\n> ${link}\n\n`;
				}

				pageBlock += pageText;
				sections.push(pageBlock);
			}
			return sections.join("\n\n---\n\n");
		}
	}

	// Default mode (continuous note without page breaks):
	const cleanedTranscription = transcription
		.replace(/<!--\s*(?:PAGE_BREAK|PAGE)\s*:\s*(?:Page\s*)?\d+\s*-->/gi, "")
		.trim();

	if (!settings.embedCallouts || savedFiles.length === 0) {
		return cleanedTranscription;
	}

	// Place callouts for all original scans at the top of this group
	let headerCallouts = "";
	for (let i = 0; i < savedFiles.length; i++) {
		const file = savedFiles[i];
		const link = app.fileManager.generateMarkdownLink(file, sourcePath);
		const title = savedFiles.length > 1 ? `${calloutTitle} (Page ${i + 1})` : calloutTitle;
		headerCallouts += `> [!info]- ${title}\n> ${link}\n\n`;
	}

	return `${headerCallouts}${cleanedTranscription}`;
}

/**
 * Creates a new note or appends to an existing note.
 */
export async function writeNoteContent(
	app: App,
	formattedContent: string,
	targetMode: "new" | "append",
	activeFile: TFile | null,
	newNoteTitle?: string,
	noteFolderPath?: string
): Promise<AssembledNoteResult> {
	if (targetMode === "append" && activeFile) {
		const existingContent = await app.vault.read(activeFile);
		const divider = existingContent.trim().length > 0 ? "\n\n---\n\n" : "";
		const updatedContent = `${existingContent.trim()}${divider}${formattedContent}`;
		await app.vault.modify(activeFile, updatedContent);

		return {
			targetFile: activeFile,
			isNewFile: false,
		};
	}

	// Create new note
	const baseName = newNoteTitle && newNoteTitle.trim().length > 0
		? newNoteTitle.trim()
		: `Handwritten Note ${getFormattedDate()}`;

	const cleanParent = (!noteFolderPath || noteFolderPath === "/") ? "" : normalizePath(noteFolderPath);
	let filePath = normalizePath(cleanParent ? `${cleanParent}/${baseName}.md` : `${baseName}.md`);
	filePath = getUniqueFilePath(app, filePath);

	const createdFile = await app.vault.create(filePath, formattedContent);

	return {
		targetFile: createdFile,
		isNewFile: true,
	};
}

function getUniqueFilePath(app: App, targetPath: string): string {
	let path = normalizePath(targetPath);
	if (!app.vault.getAbstractFileByPath(path)) {
		return path;
	}

	const lastDot = path.lastIndexOf(".");
	const basePath = lastDot !== -1 ? path.substring(0, lastDot) : path;
	const ext = lastDot !== -1 ? path.substring(lastDot) : "";

	let counter = 1;
	while (app.vault.getAbstractFileByPath(`${basePath} (${counter})${ext}`)) {
		counter++;
	}

	return `${basePath} (${counter})${ext}`;
}

function getFormattedDate(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	const h = String(now.getHours()).padStart(2, "0");
	const min = String(now.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${d} ${h}-${min}`;
}
