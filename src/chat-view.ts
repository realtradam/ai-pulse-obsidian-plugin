import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type AIOrganizer from "./main";
import type { ChatMessage } from "./ollama-client";
import { sendChatMessage } from "./ollama-client";
import { SettingsModal } from "./settings-modal";

export const VIEW_TYPE_CHAT = "ai-organizer-chat";

export class ChatView extends ItemView {
	private plugin: AIOrganizer;
	private messages: ChatMessage[] = [];
	private messageContainer: HTMLDivElement | null = null;
	private textarea: HTMLTextAreaElement | null = null;
	private sendButton: HTMLButtonElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: AIOrganizer) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_CHAT;
	}

	getDisplayText(): string {
		return "AI Chat";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ai-organizer-chat-container");

		// --- Top region: Chat area ---
		const messagesArea = contentEl.createDiv({ cls: "ai-organizer-messages-area" });
		this.messageContainer = messagesArea.createDiv({ cls: "ai-organizer-messages" });

		const inputRow = messagesArea.createDiv({ cls: "ai-organizer-input-row" });
		this.textarea = inputRow.createEl("textarea", {
			attr: { placeholder: "Type a message...", rows: "2" },
		});

		const buttonGroup = inputRow.createDiv({ cls: "ai-organizer-input-buttons" });

		// Settings button
		const settingsBtn = buttonGroup.createEl("button", {
			cls: "ai-organizer-settings-btn",
			attr: { "aria-label": "Settings" },
		});
		setIcon(settingsBtn, "settings");
		settingsBtn.addEventListener("click", () => {
			new SettingsModal(this.plugin).open();
		});

		// Send button
		this.sendButton = buttonGroup.createEl("button", { text: "Send" });

		this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				void this.handleSend();
			}
		});

		this.sendButton.addEventListener("click", () => {
			void this.handleSend();
		});

		// Auto-connect on open
		void this.plugin.connect();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
		this.messages = [];
		this.messageContainer = null;
		this.textarea = null;
		this.sendButton = null;
	}

	private async handleSend(): Promise<void> {
		if (this.textarea === null || this.sendButton === null || this.messageContainer === null) {
			return;
		}

		const text = this.textarea.value.trim();
		if (text === "") {
			return;
		}

		if (this.plugin.settings.model === "") {
			new Notice("Select a model first.");
			return;
		}

		// Append user message
		this.appendMessage("user", text);
		this.textarea.value = "";
		this.scrollToBottom();

		// Track in message history
		this.messages.push({ role: "user", content: text });

		// Disable input
		this.setInputEnabled(false);

		try {
			const response = await sendChatMessage(
				this.plugin.settings.ollamaUrl,
				this.plugin.settings.model,
				this.messages,
			);

			this.messages.push({ role: "assistant", content: response });
			this.appendMessage("assistant", response);
			this.scrollToBottom();
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.message : "Unknown error.";
			new Notice(errMsg);
			this.appendMessage("error", `Error: ${errMsg}`);
			this.scrollToBottom();
		}

		// Re-enable input
		this.setInputEnabled(true);
		this.textarea.focus();
	}

	private appendMessage(role: "user" | "assistant" | "error", content: string): void {
		if (this.messageContainer === null) {
			return;
		}

		const cls =
			role === "error"
				? "ai-organizer-message assistant error"
				: `ai-organizer-message ${role}`;

		this.messageContainer.createDiv({ cls, text: content });
	}

	private scrollToBottom(): void {
		if (this.messageContainer !== null) {
			this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
		}
	}

	private setInputEnabled(enabled: boolean): void {
		if (this.textarea !== null) {
			this.textarea.disabled = !enabled;
		}
		if (this.sendButton !== null) {
			this.sendButton.disabled = !enabled;
			this.sendButton.textContent = enabled ? "Send" : "...";
		}
	}
}
