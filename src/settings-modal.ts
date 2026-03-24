import { Modal, Setting } from "obsidian";
import type AIPulse from "./main";
import { showModel } from "./ollama-client";
import type { ModelInfo } from "./ollama-client";

export class SettingsModal extends Modal {
	private plugin: AIPulse;
	private modelInfo: ModelInfo | null = null;
	private ctxMaxEl: HTMLElement | null = null;
	private ctxInputEl: HTMLInputElement | null = null;

	constructor(plugin: AIPulse) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ai-pulse-settings-modal");

		this.setTitle("AI Settings");

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
					void this.fetchAndApplyModelInfo(value);
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

		// --- System Prompt ---

		const promptHeader = contentEl.createEl("h4", { text: "System Prompt" });
		promptHeader.style.marginTop = "16px";
		promptHeader.style.marginBottom = "4px";

		// File path setting (disabled/enabled based on toggle)
		let fileInputEl: HTMLInputElement | null = null;
		const fileSetting = new Setting(contentEl)
			.setName("Prompt File")
			.setDesc("Vault path to a note whose content will be used as the system prompt.")
			.addText((text) => {
				text
					.setPlaceholder("agent.md")
					.setValue(this.plugin.settings.systemPromptFile)
					.onChange(async (value) => {
						this.plugin.settings.systemPromptFile = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = "200px";
				fileInputEl = text.inputEl;
			});

		const updateFileSettingState = (enabled: boolean): void => {
			fileSetting.settingEl.toggleClass("ai-pulse-setting-disabled", !enabled);
			if (fileInputEl !== null) {
				fileInputEl.disabled = !enabled;
			}
		};

		// Toggle to enable/disable
		const toggleSetting = new Setting(contentEl)
			.setName("Use Custom Instructions")
			.setDesc("Read a vault note as persistent AI instructions (e.g. formatting rules, writing style).")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.useSystemPromptFile)
					.onChange(async (value) => {
						this.plugin.settings.useSystemPromptFile = value;
						await this.plugin.saveSettings();
						updateFileSettingState(value);
					});
			});

		// Move toggle above file path in the DOM
		contentEl.insertBefore(toggleSetting.settingEl, fileSetting.settingEl);

		// Set initial state
		updateFileSettingState(this.plugin.settings.useSystemPromptFile);

		// --- Vault Context ---

		const ctxHeader = contentEl.createEl("h4", { text: "Vault Context" });
		ctxHeader.style.marginTop = "16px";
		ctxHeader.style.marginBottom = "4px";

		// Recent files count (disabled/enabled based on toggle)
		let recentFilesInputEl: HTMLInputElement | null = null;
		const recentFilesSetting = new Setting(contentEl)
			.setName("Recent Files Count")
			.setDesc("Number of recently modified files to include in the context.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.max = "100";
				text.inputEl.step = "5";
				text.setValue(String(this.plugin.settings.vaultContextRecentFiles));
				text.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 0) {
						this.plugin.settings.vaultContextRecentFiles = num;
						await this.plugin.saveSettings();
					}
				});
				text.inputEl.style.width = "60px";
				recentFilesInputEl = text.inputEl;
			});

		const updateVaultContextState = (enabled: boolean): void => {
			recentFilesSetting.settingEl.toggleClass("ai-pulse-setting-disabled", !enabled);
			if (recentFilesInputEl !== null) {
				recentFilesInputEl.disabled = !enabled;
			}
		};

		const vaultContextToggle = new Setting(contentEl)
			.setName("Inject Vault Context")
			.setDesc("Automatically inject a summary of the vault (folders, tags, recent files) into each conversation.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.injectVaultContext)
					.onChange(async (value) => {
						this.plugin.settings.injectVaultContext = value;
						await this.plugin.saveSettings();
						updateVaultContextState(value);
					});
			});

		// Move toggle above count in the DOM
		contentEl.insertBefore(vaultContextToggle.settingEl, recentFilesSetting.settingEl);

		// Set initial state
		updateVaultContextState(this.plugin.settings.injectVaultContext);

		// --- Generation Parameters ---

		const paramHeader = contentEl.createEl("h4", { text: "Generation Parameters" });
		paramHeader.style.marginTop = "16px";
		paramHeader.style.marginBottom = "4px";

		// Temperature
		const tempSetting = new Setting(contentEl)
			.setName("Temperature")
			.setDesc("Controls randomness. Lower = more focused, higher = more creative.");

		const tempValueEl = tempSetting.descEl.createSpan({
			cls: "ai-pulse-param-value",
			text: ` (${this.plugin.settings.temperature.toFixed(2)})`,
		});

		tempSetting.addSlider((slider) =>
			slider
				.setLimits(0, 2, 0.05)
				.setValue(this.plugin.settings.temperature)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.temperature = value;
					tempValueEl.setText(` (${value.toFixed(2)})`);
					await this.plugin.saveSettings();
				}),
		);

		// Context Window
		const ctxSetting = new Setting(contentEl)
			.setName("Context Window")
			.setDesc("Max tokens the model sees (prompt + response).");

		let ctxInputEl: HTMLInputElement | null = null;

		ctxSetting.addText((text) => {
			text.inputEl.type = "number";
			text.inputEl.min = "256";
			text.inputEl.max = "1048576";
			text.inputEl.step = "256";
			text.setValue(String(this.plugin.settings.numCtx));
			text.onChange(async (value) => {
				const num = parseInt(value, 10);
				if (!isNaN(num) && num >= 256) {
					this.plugin.settings.numCtx = num;
					await this.plugin.saveSettings();
				}
				this.updateCtxMaxWarning();
			});
			text.inputEl.style.width = "80px";
			ctxInputEl = text.inputEl;
		});

		// Model max label placed below the input
		const ctxControlEl = ctxSetting.controlEl;
		ctxControlEl.style.flexDirection = "column";
		ctxControlEl.style.alignItems = "flex-end";
		this.ctxMaxEl = ctxControlEl.createDiv({ cls: "ai-pulse-ctx-max" });
		this.ctxMaxEl.style.cursor = "pointer";
		this.ctxMaxEl.addEventListener("click", async () => {
			if (this.modelInfo !== null && this.ctxInputEl !== null) {
				this.plugin.settings.numCtx = this.modelInfo.contextLength;
				this.ctxInputEl.value = String(this.modelInfo.contextLength);
				await this.plugin.saveSettings();
				this.updateCtxMaxWarning();
			}
		});
		this.ctxInputEl = ctxInputEl;

		// Max Output Tokens
		const predictSetting = new Setting(contentEl)
			.setName("Max Output Tokens")
			.setDesc("Maximum tokens to generate. -1 = unlimited.");

		predictSetting.addText((text) => {
			text.inputEl.type = "number";
			text.inputEl.min = "-1";
			text.inputEl.max = "1048576";
			text.inputEl.step = "256";
			text.setValue(String(this.plugin.settings.numPredict));
			text.onChange(async (value) => {
				const num = parseInt(value, 10);
				if (!isNaN(num) && num >= -1) {
					this.plugin.settings.numPredict = num;
					await this.plugin.saveSettings();
				}
			});
			text.inputEl.style.width = "80px";
		});

		// Fetch model info if a model is already selected
		if (this.plugin.settings.model !== "") {
			void this.fetchAndApplyModelInfo(this.plugin.settings.model);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async fetchAndApplyModelInfo(model: string): Promise<void> {
		if (model === "") return;
		try {
			this.modelInfo = await showModel(this.plugin.settings.ollamaUrl, model);
			if (this.modelInfo !== null && this.ctxMaxEl !== null) {
				this.ctxMaxEl.setText(`Model max: ${this.modelInfo.contextLength.toLocaleString()}`);
				this.updateCtxMaxWarning();
			}
		} catch {
			// Silently ignore — model info is optional enhancement
			if (this.ctxMaxEl !== null) {
				this.ctxMaxEl.setText("");
			}
		}
	}

	private updateCtxMaxWarning(): void {
		if (this.ctxMaxEl === null || this.modelInfo === null) return;
		const exceeds = this.plugin.settings.numCtx > this.modelInfo.contextLength;
		this.ctxMaxEl.toggleClass("ai-pulse-ctx-max-warn", exceeds);
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
