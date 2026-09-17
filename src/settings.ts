import { App, PluginSettingTab, Setting } from "obsidian";
import type NotebookDigitizerPlugin from "./main";

export interface NotebookDigitizerSettings {
	apiKey: string;
	model: string;
	customModel: string;
	attachmentFolder: string;
	embedCallouts: boolean;
	enablePageBreaks: boolean;
	calloutTitle: string;
	customPrompt: string;
}

export const DEFAULT_SETTINGS: NotebookDigitizerSettings = {
	apiKey: "",
	model: "gemini-3.8-flash",
	customModel: "",
	attachmentFolder: "scans",
	embedCallouts: true,
	enablePageBreaks: false,
	calloutTitle: "Original Scan",
	customPrompt: "",
};

export const AVAILABLE_MODELS = [
	{ id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (Latest - Fast & Recommended)" },
	{ id: "gemini-3.1-pro", name: "Gemini 3.1 Pro (Most Capable for Complex Handwriting)" },
	{ id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite (High Throughput)" },
	{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
	{ id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
	{ id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
	{ id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
	{ id: "custom", name: "Custom Model (specify below)..." },
];

export function getEffectiveModel(settings: NotebookDigitizerSettings): string {
	if (settings.model === "custom" && settings.customModel.trim()) {
		return settings.customModel.trim();
	}
	return settings.model || "gemini-3.8-flash";
}

export class NotebookDigitizerSettingTab extends PluginSettingTab {
	plugin: NotebookDigitizerPlugin;

	constructor(app: App, plugin: NotebookDigitizerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Handwritten Notebook Digitizer Settings" });

		// API Key Setting
		const keySetting = new Setting(containerEl)
			.setName("Gemini API Key")
			.setDesc("Each user should provide their own free Google Gemini API key. Keys are saved locally in your vault.")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("AIzaSy...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		keySetting.descEl.createEl("br");
		const link = keySetting.descEl.createEl("a", {
			text: "Get your free API key at Google AI Studio (aistudio.google.com/app/apikey)",
			href: "https://aistudio.google.com/app/apikey",
		});
		link.setAttr("target", "_blank");

		// Model Selection
		new Setting(containerEl)
			.setName("Gemini Model")
			.setDesc("Select the model to use for handwriting recognition. Defaults to Gemini 3.8 Flash.")
			.addDropdown((dropdown) => {
				for (const model of AVAILABLE_MODELS) {
					dropdown.addOption(model.id, model.name);
				}
				dropdown.setValue(this.plugin.settings.model);
				dropdown.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide custom model input
				});
			});

		// Custom Model Input (shown if "custom" is selected)
		if (this.plugin.settings.model === "custom") {
			new Setting(containerEl)
				.setName("Custom Model Name")
				.setDesc("Enter any valid Gemini model identifier from Google AI Studio (e.g. gemini-3.8-flash).")
				.addText((text) => {
					text
						.setPlaceholder("e.g. gemini-3.8-flash")
						.setValue(this.plugin.settings.customModel)
						.onChange(async (value) => {
							this.plugin.settings.customModel = value.trim();
							await this.plugin.saveSettings();
						});
				});
		}


		// Embed Callouts
		new Setting(containerEl)
			.setName("Embed Scans in Collapsible Callouts")
			.setDesc("Embed original page scans inside a collapsible callout for easy proofreading.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.embedCallouts)
					.onChange(async (value) => {
						this.plugin.settings.embedCallouts = value;
						await this.plugin.saveSettings();
					});
			});

		// Callout Title
		new Setting(containerEl)
			.setName("Callout Title")
			.setDesc("Default title for the collapsible image callout (e.g., 'Original Scan' or 'صورة الصفحة الأصلية').")
			.addText((text) => {
				text
					.setPlaceholder("Original Scan")
					.setValue(this.plugin.settings.calloutTitle)
					.onChange(async (value) => {
						this.plugin.settings.calloutTitle = value.trim() || "Original Scan";
						await this.plugin.saveSettings();
					});
			});

		// Attachment Folder
		new Setting(containerEl)
			.setName("Scans Subfolder")
			.setDesc("Name of the subfolder under the note's directory where uploaded page scans will be stored (defaults to 'scans'). Keeps your notes directory clean.")
			.addText((text) => {
				text
					.setPlaceholder("scans")
					.setValue(this.plugin.settings.attachmentFolder)
					.onChange(async (value) => {
						this.plugin.settings.attachmentFolder = value.trim() || "scans";
						await this.plugin.saveSettings();
					});
			});

		// Custom Base Instructions
		new Setting(containerEl)
			.setName("Default Custom Instructions")
			.setDesc("Optional persistent instructions added to every transcription prompt (e.g., preferred formatting, vocabulary).")
			.addTextArea((textArea) => {
				textArea
					.setPlaceholder("e.g. Prefer Modern Standard Arabic formatting. Keep English programming terms in inline code blocks.")
					.setValue(this.plugin.settings.customPrompt)
					.onChange(async (value) => {
						this.plugin.settings.customPrompt = value;
						await this.plugin.saveSettings();
					});
				textArea.inputEl.rows = 4;
				textArea.inputEl.cols = 40;
			});
	}
}
