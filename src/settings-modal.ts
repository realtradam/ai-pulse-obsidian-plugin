import { Modal, Setting } from "obsidian";
import type AIOrganizer from "./main";

export class SettingsModal extends Modal {
	private plugin: AIOrganizer;

	constructor(plugin: AIOrganizer) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ai-organizer-settings-modal");

		this.setTitle("AI Organizer Settings");

		// Ollama URL setting
		new Setting(contentEl)
			.setName("Ollama URL")
			.setDesc("Base URL of the Ollama server.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.ollamaUrl)
					.onChange(async (value) => {
						this.plugin.settings.ollamaUrl = value;
						await this.plugin.saveSettings();
					}),
			);

		// Model dropdown
		let modelDropdownSelectEl: HTMLSelectElement | null = null;

		const modelSetting = new Setting(contentEl)
			.setName("Model")
			.setDesc("Select the model to use.")
			.addDropdown((dropdown) => {
				this.populateModelDropdown(dropdown.selectEl);
				dropdown.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				});
				modelDropdownSelectEl = dropdown.selectEl;
			});

		// Connect button
		const connectSetting = new Setting(contentEl)
			.setName("Connect")
			.setDesc(this.plugin.connectionMessage);

		connectSetting.addButton((button) =>
			button.setButtonText("Connect").onClick(async () => {
				const descEl = connectSetting.descEl;
				descEl.setText("Connecting...");

				await this.plugin.connect();

				descEl.setText(this.plugin.connectionMessage);

				if (modelDropdownSelectEl !== null) {
					this.populateModelDropdown(modelDropdownSelectEl);
				}
			}),
		);

		// Move connect above model in the DOM
		contentEl.insertBefore(connectSetting.settingEl, modelSetting.settingEl);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private populateModelDropdown(selectEl: HTMLSelectElement): void {
		const models = this.plugin.availableModels;

		selectEl.empty();

		if (models.length === 0) {
			const placeholderOpt = selectEl.createEl("option", {
				text: "Connect first",
				attr: { value: "" },
			});
			placeholderOpt.value = "";
			selectEl.disabled = true;
			return;
		}

		const placeholderOpt = selectEl.createEl("option", {
			text: "Select a model...",
			attr: { value: "" },
		});
		placeholderOpt.value = "";

		for (const modelName of models) {
			const opt = selectEl.createEl("option", {
				text: modelName,
				attr: { value: modelName },
			});
			opt.value = modelName;
		}

		if (
			this.plugin.settings.model !== "" &&
			models.includes(this.plugin.settings.model)
		) {
			selectEl.value = this.plugin.settings.model;
		}

		selectEl.disabled = false;
	}
}
