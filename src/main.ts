import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, NotebookDigitizerSettingTab, NotebookDigitizerSettings } from "./settings";
import { DigitizeModal } from "./modal";

export default class NotebookDigitizerPlugin extends Plugin {
	settings: NotebookDigitizerSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Add ribbon icon to open the digitizer modal
		this.addRibbonIcon("camera", "Digitize Handwritten Notes", () => {
			new DigitizeModal(this.app, this).open();
		});

		// Command 1: Open general digitizer modal
		this.addCommand({
			id: "digitize-handwritten-notes",
			name: "Digitize Handwritten Notes",
			callback: () => {
				new DigitizeModal(this.app, this).open();
			},
		});

		// Command 2: Explicitly append to active note
		this.addCommand({
			id: "append-handwritten-notes-to-active",
			name: "Append Handwritten Notes to Active File",
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

