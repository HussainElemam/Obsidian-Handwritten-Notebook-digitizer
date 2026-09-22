// Mock obsidian module for headless node runner
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
	if (id === "obsidian") {
		return {
			requestUrl: async () => { throw new Error("requestUrl is not available in logic tests"); },
			App: class {
				fileManager = {
					generateMarkdownLink: (file: any) => `![[${file.path}]]`,
				};
			},
			TFile: class {
				path: string;
				name: string;
				constructor(path: string) {
					this.path = path;
					this.name = path.split("/").pop() || "";
				}
			},
			TFolder: class { },
			PluginSettingTab: class { },
			Setting: class {
				setName() { return this; }
				setDesc() { return this; }
				addText() { return this; }
				addDropdown() { return this; }
				addToggle() { return this; }
				addTextArea() { return this; }
			},
			normalizePath: (p: string) => p,
		};
	}
	return originalRequire.apply(this, arguments);
};

import { buildSystemPrompt } from "../src/prompts";

function runTests() {
	console.log("--- Test 1: buildSystemPrompt ---");
	const promptDefault = buildSystemPrompt();
	if (!promptDefault.includes("expert transcriber") || !promptDefault.includes("ONE seamless, continuous document")) {
		throw new Error("Default prompt missing essential continuous document instructions");
	}
	if (promptDefault.includes("PAGE_BREAK: 1")) {
		throw new Error("Prompt should not contain page break markers");
	}
	if (!promptDefault.includes("Mermaid diagram") || !promptDefault.includes("```mermaid")) {
		throw new Error("Prompt missing Mermaid diagram instructions");
	}
	console.log("✓ Default prompt verified (seamless, no page breaks, Mermaid diagrams enabled)");

	const promptWithCustom = buildSystemPrompt("Keep technical terms in code blocks.", "Ignore sketches on page 2.");
	if (!promptWithCustom.includes("Keep technical terms in code blocks") || !promptWithCustom.includes("Ignore sketches on page 2")) {
		throw new Error("Prompt did not properly include custom and note-specific instructions");
	}
	console.log("✓ Custom prompt insertion verified");

	console.log("--- Test 3: buildSystemPrompt with page breaks enabled ---");
	const promptWithBreaks = buildSystemPrompt("", "", true);
	if (!promptWithBreaks.includes("<!-- PAGE_BREAK: 1 -->")) {
		throw new Error("Prompt with page breaks enabled must contain PAGE_BREAK markers");
	}
	console.log("✓ Page break prompt verified");

	console.log("--- Test 4: getEffectiveModel and DEFAULT_SETTINGS ---");
	const { getEffectiveModel, DEFAULT_SETTINGS } = require("../src/settings");
	if (DEFAULT_SETTINGS.model !== "gemini-3.8-flash") {
		throw new Error(`Expected default model to be gemini-3.8-flash, got: ${DEFAULT_SETTINGS.model}`);
	}
	if (DEFAULT_SETTINGS.attachmentFolder !== "scans") {
		throw new Error(`Expected attachmentFolder to default to 'scans', got: ${DEFAULT_SETTINGS.attachmentFolder}`);
	}
	if (getEffectiveModel({ model: "gemini-3.1-pro-preview" }) !== "gemini-3.1-pro-preview") {
		throw new Error("Failed to resolve standard model");
	}
	if (getEffectiveModel({ model: "custom", customModel: "gemini-ultra-special" }) !== "gemini-ultra-special") {
		throw new Error("Failed to resolve custom model");
	}
	let emptyCustomRejected = false;
	try {
		getEffectiveModel({ model: "custom", customModel: "" });
	} catch {
		emptyCustomRejected = true;
	}
	if (!emptyCustomRejected) {
		throw new Error("An empty custom model ID should be rejected");
	}
	console.log("✓ Settings defaults and model resolution verified");

	console.log("--- Test 5: formatNoteWithCallouts ---");
	const { formatNoteWithCallouts } = require("../src/noteBuilder");
	const { App, TFile } = require("obsidian");
	const mockApp = new App();
	const scanFile = new TFile("scans/page_1.jpg");

	const note = formatNoteWithCallouts(
		mockApp,
		"Test transcription text",
		[scanFile],
		DEFAULT_SETTINGS,
		"note.md"
	);
	if (!note.includes("> [!info]- Original scan") || !note.includes("page_1.jpg")) {
		throw new Error("Note should contain Original Scan callout with link to scan");
	}
	if (!note.includes("Test transcription text")) {
		throw new Error("Note should contain transcription text");
	}
	console.log("✓ Callout format verified");

	console.log("--- Test 6: formatNoteWithCallouts with embedCallouts = false ---");
	const noteNoCallouts = formatNoteWithCallouts(
		mockApp,
		"Test transcription text",
		[],
		{ ...DEFAULT_SETTINGS, embedCallouts: false },
		"note.md"
	);
	if (noteNoCallouts.includes("> [!info]- Original scan") || noteNoCallouts.includes("scans/")) {
		throw new Error("Note should NOT contain any callouts when embedCallouts is false");
	}
	if (!noteNoCallouts.includes("Test transcription text")) {
		throw new Error("Note should contain transcription text");
	}
	console.log("✓ embedCallouts = false verified (continuous note)");

	console.log("--- Test 7: formatNoteWithCallouts with page breaks and embedCallouts = false ---");
	const twoPages = "<!-- PAGE_BREAK: 1 -->\nPage 1 content\n<!-- PAGE_BREAK: 2 -->\nPage 2 content";
	const noteBreaksNoCallouts = formatNoteWithCallouts(
		mockApp,
		twoPages,
		[],
		{ ...DEFAULT_SETTINGS, enablePageBreaks: true, embedCallouts: false },
		"note.md"
	);
	if (noteBreaksNoCallouts.includes("> [!info]-") || noteBreaksNoCallouts.includes("Original Scan")) {
		throw new Error("Note should NOT contain any callouts when embedCallouts is false in page break mode");
	}
	if (!noteBreaksNoCallouts.includes("Page 1 content") || !noteBreaksNoCallouts.includes("Page 2 content")) {
		throw new Error("Note should contain both pages content");
	}
	if (!noteBreaksNoCallouts.includes("---")) {
		throw new Error("Note should contain page divider (---)");
	}
	console.log("✓ embedCallouts = false with page breaks verified");

	console.log("--- Test 8: note title sanitization ---");
	const { sanitizeNoteTitle } = require("../src/noteBuilder");
	if (sanitizeNoteTitle("Lecture/Notes: Week 1") !== "Lecture-Notes- Week 1") {
		throw new Error("Note title should remove path separators and reserved filename characters");
	}
	console.log("✓ Note title sanitization verified");

	console.log("--- Test 9: append preserves existing note content ---");
	const { appendWithDivider } = require("../src/noteBuilder");
	const existingNote = "  Existing note with intentional whitespace  \n";
	const appendedNote = appendWithDivider(existingNote, "New transcription");
	if (!appendedNote.startsWith(existingNote) || !appendedNote.endsWith("---\n\nNew transcription")) {
		throw new Error("Appending should preserve existing content exactly and add a divider");
	}
	console.log("✓ Non-destructive append formatting verified");

	console.log("--- Test 10: Gemini response completion validation ---");
	const { extractTranscription } = require("../src/gemini");
	const completed = extractTranscription({
		candidates: [{ finishReason: "STOP", content: { parts: [{ text: " Complete note " }] } }],
	});
	if (completed !== "Complete note") {
		throw new Error("Completed Gemini response was not extracted correctly");
	}
	let truncationRejected = false;
	try {
		extractTranscription({
			candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "Partial note" }] } }],
		});
	} catch {
		truncationRejected = true;
	}
	if (!truncationRejected) {
		throw new Error("Truncated Gemini responses should be rejected");
	}
	console.log("✓ Gemini finish reasons verified");

	console.log("--- All logic tests passed! ---");
}

runTests();
