import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, NotebookDigitizerSettingTab, NotebookDigitizerSettings } from "./settings";
import { DigitizeModal } from "./modal";

export default class NotebookDigitizerPlugin extends Plugin {
	settings: NotebookDigitizerSettings;
	private static readonly DEFAULT_API_KEY_SECRET = "notebook-digitizer-gemini-api-key";

	async onload(): Promise<void> {
		await this.loadSettings();

		// Add ribbon icon to open the digitizer modal
		this.addRibbonIcon("camera", "Digitize handwritten notes", () => {
			new DigitizeModal(this.app, this).open();
		});

		// Command 1: Open general digitizer modal
		this.addCommand({
			id: "digitize-handwritten-notes",
			name: "Digitize handwritten notes",
			callback: () => {
				new DigitizeModal(this.app, this).open();
			},
		});

		// Command 2: Explicitly append to active note
		this.addCommand({
			id: "append-handwritten-notes-to-active",
			name: "Append handwritten notes to active file",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.extension === "md") {
					if (!checking) {
						new DigitizeModal(this.app, this, "append").open();
					}
					return true;
				}
				return false;
			},
		});

		// Register settings tab
		this.addSettingTab(new NotebookDigitizerSettingTab(this.app, this));
	}

	onunload(): void {
		// Cleanup when plugin is disabled
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<NotebookDigitizerSettings> & { apiKey?: string } | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});

		// Migrate API keys saved by versions prior to 1.0.0 out of data.json.
		if (loaded?.apiKey) {
			const secretId = this.settings.apiKeySecret || NotebookDigitizerPlugin.DEFAULT_API_KEY_SECRET;
			this.app.secretStorage.setSecret(secretId, loaded.apiKey);
			this.settings.apiKeySecret = secretId;
			delete (this.settings as NotebookDigitizerSettings & { apiKey?: string }).apiKey;
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	getApiKey(): string {
		if (!this.settings.apiKeySecret) return "";
		return this.app.secretStorage.getSecret(this.settings.apiKeySecret) ?? "";
	}

	async setApiKey(apiKey: string): Promise<void> {
		const secretId = this.settings.apiKeySecret || NotebookDigitizerPlugin.DEFAULT_API_KEY_SECRET;
		this.app.secretStorage.setSecret(secretId, apiKey.trim());
		this.settings.apiKeySecret = secretId;
		await this.saveSettings();
	}
}
