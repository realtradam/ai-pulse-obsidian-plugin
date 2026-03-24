import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type AIOrganizer from "./main";
import type { ChatMessage, ToolCallEvent, ApprovalRequestEvent } from "./ollama-client";
import { sendChatMessageStreaming } from "./ollama-client";
import { SettingsModal } from "./settings-modal";
import { ToolModal } from "./tool-modal";
import { TOOL_REGISTRY } from "./tools";
import type { OllamaToolDefinition } from "./tools";

export const VIEW_TYPE_CHAT = "ai-organizer-chat";

export class ChatView extends ItemView {
	private plugin: AIOrganizer;
	private messages: ChatMessage[] = [];
	private messageContainer: HTMLDivElement | null = null;
	private textarea: HTMLTextAreaElement | null = null;
	private sendButton: HTMLButtonElement | null = null;
	private toolsButton: HTMLButtonElement | null = null;
	private abortController: AbortController | null = null;
	private scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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

		// --- FAB Speed Dial ---
		const fab = messagesArea.createDiv({ cls: "ai-organizer-fab" });

		// Main FAB trigger button (first child)
		const fabTrigger = fab.createEl("button", {
			cls: "ai-organizer-fab-trigger",
			attr: { "aria-label": "Actions", tabindex: "0" },
		});
		setIcon(fabTrigger, "settings");

		// Speed dial actions (revealed on focus-within)
		const settingsAction = fab.createDiv({ cls: "ai-organizer-fab-action" });
		const settingsLabel = settingsAction.createSpan({ cls: "ai-organizer-fab-label", text: "AI Settings" });
		void settingsLabel;
		const settingsBtn = settingsAction.createEl("button", {
			cls: "ai-organizer-fab-btn",
			attr: { "aria-label": "Settings" },
		});
		setIcon(settingsBtn, "sliders-horizontal");
		settingsBtn.addEventListener("click", () => {
			new SettingsModal(this.plugin).open();
			// Blur to close the FAB
			(document.activeElement as HTMLElement)?.blur();
		});

		const toolsAction = fab.createDiv({ cls: "ai-organizer-fab-action" });
		const toolsLabel = toolsAction.createSpan({ cls: "ai-organizer-fab-label", text: "Tools" });
		void toolsLabel;
		this.toolsButton = toolsAction.createEl("button", {
			cls: "ai-organizer-fab-btn",
			attr: { "aria-label": "Tools" },
		});
		setIcon(this.toolsButton, "wrench");
		this.updateToolsButtonState();
		this.toolsButton.addEventListener("click", () => {
			const modal = new ToolModal(this.plugin);
			modal.onClose = () => {
				this.updateToolsButtonState();
			};
			modal.open();
			(document.activeElement as HTMLElement)?.blur();
		});

		const clearAction = fab.createDiv({ cls: "ai-organizer-fab-action" });
		const clearLabel = clearAction.createSpan({ cls: "ai-organizer-fab-label", text: "Clear Chat" });
		void clearLabel;
		const clearBtn = clearAction.createEl("button", {
			cls: "ai-organizer-fab-btn",
			attr: { "aria-label": "Clear Chat" },
		});
		setIcon(clearBtn, "trash-2");
		clearBtn.addEventListener("click", () => {
			this.messages = [];
			if (this.messageContainer !== null) {
				this.messageContainer.empty();
			}
			(document.activeElement as HTMLElement)?.blur();
		});

		const inputRow = messagesArea.createDiv({ cls: "ai-organizer-input-row" });
		this.textarea = inputRow.createEl("textarea", {
			attr: { placeholder: "Type a message...", rows: "2" },
		});

		// Send button
		this.sendButton = inputRow.createEl("button", { text: "Send" });

		this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				void this.handleSend();
			}
		});

		this.sendButton.addEventListener("click", () => {
			if (this.abortController !== null) {
				// Currently streaming — abort
				this.abortController.abort();
				return;
			}
			void this.handleSend();
		});

		// Auto-connect on open
		void this.plugin.connect();
	}

	async onClose(): Promise<void> {
		if (this.abortController !== null) {
			this.abortController.abort();
		}
		this.contentEl.empty();
		this.messages = [];
		this.messageContainer = null;
		this.textarea = null;
		this.sendButton = null;
		this.toolsButton = null;
		this.abortController = null;
	}

	private getEnabledTools(): OllamaToolDefinition[] {
		const tools: OllamaToolDefinition[] = [];
		for (const tool of TOOL_REGISTRY) {
			if (this.plugin.settings.enabledTools[tool.id] === true) {
				tools.push(tool.definition);
			}
		}
		return tools;
	}

	private hasAnyToolEnabled(): boolean {
		return TOOL_REGISTRY.some(
			(tool) => this.plugin.settings.enabledTools[tool.id] === true,
		);
	}

	private updateToolsButtonState(): void {
		if (this.toolsButton === null) return;
		this.toolsButton.toggleClass("ai-organizer-tools-active", this.hasAnyToolEnabled());
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

		// Switch to streaming state
		this.abortController = new AbortController();
		this.setStreamingState(true);

		let currentBubble: HTMLDivElement | null = null;

		try {
			const enabledTools = this.getEnabledTools();
			const hasTools = enabledTools.length > 0;

			const onToolCall = (event: ToolCallEvent): void => {
				this.appendToolCall(event);
				this.scrollToBottom();
			};

			const onApprovalRequest = (event: ApprovalRequestEvent): Promise<boolean> => {
				// Remove the empty streaming bubble since the approval
				// prompt is now the active UI element
				if (currentBubble !== null && currentBubble.textContent?.trim() === "") {
					currentBubble.remove();
					currentBubble = null;
				}
				return this.showApprovalRequest(event);
			};

			const onCreateBubble = (): void => {
				// Finalize any previous bubble before creating a new one
				if (currentBubble !== null) {
					currentBubble.removeClass("ai-organizer-streaming");
					// Remove empty bubbles from tool-only rounds
					if (currentBubble.textContent?.trim() === "") {
						currentBubble.remove();
					}
				}
				currentBubble = this.createStreamingBubble();
			};

			const onChunk = (chunk: string): void => {
				if (currentBubble !== null) {
					// Remove the loading indicator on first chunk
					const loadingIcon = currentBubble.querySelector(".ai-organizer-loading-icon");
					if (loadingIcon !== null) {
						loadingIcon.remove();
					}
					currentBubble.appendText(chunk);
					this.debouncedScrollToBottom();
				}
			};

			const response = await sendChatMessageStreaming({
				ollamaUrl: this.plugin.settings.ollamaUrl,
				model: this.plugin.settings.model,
				messages: this.messages,
				tools: hasTools ? enabledTools : undefined,
				app: hasTools ? this.plugin.app : undefined,
				options: {
					temperature: this.plugin.settings.temperature,
					num_ctx: this.plugin.settings.numCtx,
					num_predict: this.plugin.settings.numPredict,
				},
				onChunk,
				onToolCall: hasTools ? onToolCall : undefined,
				onApprovalRequest: hasTools ? onApprovalRequest : undefined,
				onCreateBubble,
				abortSignal: this.abortController.signal,
			});

			// Finalize the last streaming bubble
			if (currentBubble !== null) {
				(currentBubble as HTMLDivElement).removeClass("ai-organizer-streaming");
				// Remove loading icon if still present
				const remainingIcon = (currentBubble as HTMLDivElement).querySelector(".ai-organizer-loading-icon");
				if (remainingIcon !== null) {
					remainingIcon.remove();
				}
				// Remove empty assistant bubbles (e.g., tool-only rounds with no content)
				if ((currentBubble as HTMLDivElement).textContent?.trim() === "") {
					(currentBubble as HTMLDivElement).remove();
				}
			}
			this.messages.push({ role: "assistant", content: response });
			this.scrollToBottom();
		} catch (err: unknown) {
			// Finalize bubble even on error
			if (currentBubble !== null) {
				(currentBubble as HTMLDivElement).removeClass("ai-organizer-streaming");
				const errorIcon = (currentBubble as HTMLDivElement).querySelector(".ai-organizer-loading-icon");
				if (errorIcon !== null) {
					errorIcon.remove();
				}
				// Remove empty bubble on error
				if ((currentBubble as HTMLDivElement).textContent?.trim() === "") {
					(currentBubble as HTMLDivElement).remove();
				}
			}

			const errMsg = err instanceof Error ? err.message : "Unknown error.";
			new Notice(errMsg);
			this.appendMessage("error", `Error: ${errMsg}`);
			this.scrollToBottom();
		}

		// Restore normal state
		this.abortController = null;
		this.setStreamingState(false);
		this.textarea.focus();
	}

	private createStreamingBubble(): HTMLDivElement {
		if (this.messageContainer === null) {
			// Should not happen, but satisfy TS
			throw new Error("Message container not initialized.");
		}
		const bubble = this.messageContainer.createDiv({
			cls: "ai-organizer-message assistant ai-organizer-streaming",
		});
		// Add a loading indicator icon
		const iconSpan = bubble.createSpan({ cls: "ai-organizer-loading-icon" });
		setIcon(iconSpan, "more-horizontal");
		return bubble;
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

	private appendToolCall(event: ToolCallEvent): void {
		if (this.messageContainer === null) {
			return;
		}

		const container = this.messageContainer.createDiv({ cls: "ai-organizer-tool-call" });

		const header = container.createDiv({ cls: "ai-organizer-tool-call-header" });
		setIcon(header.createSpan({ cls: "ai-organizer-tool-call-icon" }), "wrench");
		header.createSpan({ text: event.friendlyName, cls: "ai-organizer-tool-call-name" });

		container.createDiv({ text: event.summary, cls: "ai-organizer-tool-call-summary" });
		container.createDiv({ text: event.resultSummary, cls: "ai-organizer-tool-call-result-summary" });

		// DaisyUI-style collapse with checkbox
		const collapse = container.createDiv({ cls: "ai-organizer-collapse ai-organizer-collapse-arrow" });
		const collapseId = `tool-collapse-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		const checkbox = collapse.createEl("input", {
			type: "checkbox",
			attr: { id: collapseId },
		});
		checkbox.addClass("ai-organizer-collapse-toggle");
		const titleEl = collapse.createEl("label", {
			cls: "ai-organizer-collapse-title",
			attr: { for: collapseId },
			text: "Details",
		});
		void titleEl; // suppress unused warning

		const collapseContent = collapse.createDiv({ cls: "ai-organizer-collapse-content" });
		const contentInner = collapseContent.createDiv({ cls: "ai-organizer-collapse-content-inner" });

		const argsStr = JSON.stringify(event.args, null, 2);
		contentInner.createEl("pre", { text: argsStr, cls: "ai-organizer-tool-call-args" });

		const resultPreview = event.result.length > 500
			? event.result.substring(0, 500) + "..."
			: event.result;
		contentInner.createEl("pre", { text: resultPreview, cls: "ai-organizer-tool-call-result" });
	}

	private showApprovalRequest(event: ApprovalRequestEvent): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			if (this.messageContainer === null) {
				resolve(false);
				return;
			}

			const container = this.messageContainer.createDiv({ cls: "ai-organizer-approval" });

			const header = container.createDiv({ cls: "ai-organizer-approval-header" });
			setIcon(header.createSpan({ cls: "ai-organizer-approval-icon" }), "shield-alert");
			header.createSpan({ text: event.friendlyName, cls: "ai-organizer-approval-name" });

			container.createDiv({ text: event.message, cls: "ai-organizer-approval-message" });

			const buttonRow = container.createDiv({ cls: "ai-organizer-approval-buttons" });

			const approveBtn = buttonRow.createEl("button", {
				text: "Approve",
				cls: "ai-organizer-approval-approve",
			});

			const declineBtn = buttonRow.createEl("button", {
				text: "Decline",
				cls: "ai-organizer-approval-decline",
			});

			const finalize = (approved: boolean): void => {
				approveBtn.disabled = true;
				declineBtn.disabled = true;
				container.addClass(approved ? "ai-organizer-approval-approved" : "ai-organizer-approval-declined");
				const statusEl = container.createDiv({ cls: "ai-organizer-approval-status" });
				statusEl.setText(approved ? "Approved" : "Declined");
				this.scrollToBottom();
				resolve(approved);
			};

			approveBtn.addEventListener("click", () => finalize(true));
			declineBtn.addEventListener("click", () => finalize(false));

			this.scrollToBottom();
		});
	}

	private scrollToBottom(): void {
		if (this.messageContainer !== null) {
			this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
		}
	}

	private debouncedScrollToBottom(): void {
		if (this.scrollDebounceTimer !== null) return;
		this.scrollDebounceTimer = setTimeout(() => {
			this.scrollDebounceTimer = null;
			this.scrollToBottom();
		}, 50);
	}

	private setStreamingState(streaming: boolean): void {
		if (this.textarea !== null) {
			this.textarea.disabled = streaming;
		}
		if (this.sendButton !== null) {
			this.sendButton.textContent = streaming ? "Stop" : "Send";
			this.sendButton.toggleClass("ai-organizer-stop-btn", streaming);
		}
	}
}
