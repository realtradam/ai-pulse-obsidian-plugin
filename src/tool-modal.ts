import { Modal, Setting } from "obsidian";
import type AIOrganizer from "./main";
import { TOOL_REGISTRY } from "./tools";

export class ToolModal extends Modal {
	private plugin: AIOrganizer;

	constructor(plugin: AIOrganizer) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ai-organizer-tool-modal");

		this.setTitle("AI Tools");

		contentEl.createEl("p", {
			text: "Enable tools to give the AI access to your vault. Changes take effect on the next message.",
			cls: "ai-organizer-tool-modal-desc",
		});

		for (const tool of TOOL_REGISTRY) {
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
