// Mock obsidian module for headless node runner
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
	if (id === "obsidian") {
		return {
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
	console.log("✓ Default prompt verified (seamless, no page breaks)");

	const promptWithCustom = buildSystemPrompt("Use Modern Standard Arabic.", "Ignore sketches on page 2.");
	if (!promptWithCustom.includes("Use Modern Standard Arabic") || !promptWithCustom.includes("Ignore sketches on page 2")) {
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
	if (getEffectiveModel({ model: "gemini-3.1-pro" }) !== "gemini-3.1-pro") {
		throw new Error("Failed to resolve standard model");
	}
	if (getEffectiveModel({ model: "custom", customModel: "gemini-ultra-special" }) !== "gemini-ultra-special") {
		throw new Error("Failed to resolve custom model");
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
	if (!note.includes("> [!info]- Original Scan") || !note.includes("page_1.jpg")) {
		throw new Error("Note should contain Original Scan callout with link to scan");
	}
	if (!note.includes("Test transcription text")) {
		throw new Error("Note should contain transcription text");
	}
	console.log("✓ Callout format verified");

	console.log("--- All logic tests passed! ---");
}

runTests();

