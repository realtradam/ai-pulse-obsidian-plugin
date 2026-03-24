import { Modal, Setting } from "obsidian";
import type AIPulse from "./main";
import { TOOL_REGISTRY } from "./tools";

export class ToolModal extends Modal {
	private plugin: AIPulse;

	constructor(plugin: AIPulse) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ai-pulse-tool-modal");

		this.setTitle("AI Tools");

		contentEl.createEl("p", {
			text: "Enable tools to give the AI access to your vault. Changes take effect on the next message.",
			cls: "ai-pulse-tool-modal-desc",
		});

		for (const tool of TOOL_REGISTRY) {
			// Batch tools auto-enable with their parent — no separate toggle
			if (tool.batchOf !== undefined) continue;

			new Setting(contentEl)
				.setName(tool.label)
				.setDesc(tool.description)
				.addToggle((toggle) => {
					const current = this.plugin.settings.enabledTools[tool.id] ?? false;
					toggle.setValue(current);
					toggle.onChange(async (value) => {
						this.plugin.settings.enabledTools[tool.id] = value;
						await this.plugin.saveSettings();
					});
				});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
