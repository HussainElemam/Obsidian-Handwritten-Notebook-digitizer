import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type NotebookDigitizerPlugin from "./main";

export interface NotebookDigitizerSettings {
	apiKeySecret: string;
	model: string;
	customModel: string;
	attachmentFolder: string;
	embedCallouts: boolean;
	enablePageBreaks: boolean;
	calloutTitle: string;
	customPrompt: string;
}

export const DEFAULT_SETTINGS: NotebookDigitizerSettings = {
	apiKeySecret: "notebook-digitizer-gemini-api-key",
	model: "gemini-3.8-flash",
	customModel: "",
	attachmentFolder: "scans",
	embedCallouts: true,
	enablePageBreaks: false,
	calloutTitle: "Original scan",
	customPrompt: "",
};

export const AVAILABLE_MODELS = [
	{ id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (recommended)" },
	{ id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
	{ id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
	{ id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite" },
	{ id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
	{ id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite" },
	{ id: "custom", name: "Custom model" },
];

export function getEffectiveModel(settings: NotebookDigitizerSettings): string {
	if (settings.model === "custom") {
		const customModel = settings.customModel.trim();
		if (!customModel) {
			throw new Error("Enter a Gemini model ID in Settings before using the custom model option.");
		}
		return customModel;
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

		// API key setting
		const keySetting = new Setting(containerEl)
			.setName("Gemini API key")
			.setDesc("Select or create an API key in Obsidian's secure secret storage.")
			.addComponent((el) => {
				return new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.apiKeySecret)
					.onChange(async (value) => {
						this.plugin.settings.apiKeySecret = value;
						await this.plugin.saveSettings();
					});
			});

		keySetting.descEl.createEl("br");
		const link = keySetting.descEl.createEl("a", {
			text: "Get an API key at Google AI Studio (aistudio.google.com/app/apikey)",
			href: "https://aistudio.google.com/app/apikey",
		});
		link.setAttr("target", "_blank");

		// Model Selection
		new Setting(containerEl)
			.setName("Gemini model")
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
				.setName("Custom model ID")
				.setDesc("Enter an exact Gemini model identifier from Google AI Studio.")
				.addText((text) => {
					text
					.setPlaceholder("Model ID")
						.setValue(this.plugin.settings.customModel)
						.onChange(async (value) => {
							this.plugin.settings.customModel = value.trim();
							await this.plugin.saveSettings();
						});
				});
		}


		// Callout Title
		new Setting(containerEl)
			.setName("Callout title")
			.setDesc("Default title for the collapsible image callout.")
			.addText((text) => {
				text
					.setPlaceholder("Original scan")
					.setValue(this.plugin.settings.calloutTitle)
					.onChange(async (value) => {
						this.plugin.settings.calloutTitle = value.trim() || "Original scan";
						await this.plugin.saveSettings();
					});
			});

		// Attachment Folder
		new Setting(containerEl)
			.setName("Scans subfolder")
			.setDesc("Name of the subfolder under the note's directory where uploaded page scans will be stored (defaults to 'scans'). Keeps your notes directory clean.")
			.addText((text) => {
				text
					.setPlaceholder("Scans")
					.setValue(this.plugin.settings.attachmentFolder)
					.onChange(async (value) => {
						this.plugin.settings.attachmentFolder = value.trim() || "scans";
						await this.plugin.saveSettings();
					});
			});

		// Custom Base Instructions
		new Setting(containerEl)
			.setName("Default custom instructions")
			.setDesc("Optional persistent instructions added to every transcription prompt (e.g., preferred formatting, vocabulary).")
			.addTextArea((textArea) => {
				textArea
					.setPlaceholder("Keep technical terms in inline code blocks and prefer bullets for summary lists.")
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
