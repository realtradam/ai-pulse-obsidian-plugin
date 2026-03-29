import { ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type AIPulse from "./main";
import type { ChatMessage, ToolCallEvent, ApprovalRequestEvent } from "./ollama-client";
import { sendChatMessageStreaming } from "./ollama-client";
import { SettingsModal } from "./settings-modal";
import { ToolModal } from "./tool-modal";
import { TOOL_REGISTRY } from "./tools";
import type { OllamaToolDefinition } from "./tools";
import { collectVaultContext, formatVaultContext } from "./vault-context";

export const VIEW_TYPE_CHAT = "ai-pulse-chat";

export class ChatView extends ItemView {
	private plugin: AIPulse;
	private messages: ChatMessage[] = [];
	private messageContainer: HTMLDivElement | null = null;
	private textarea: HTMLTextAreaElement | null = null;
	private sendButton: HTMLButtonElement | null = null;
	private toolsButton: HTMLButtonElement | null = null;
	private abortController: AbortController | null = null;
	private scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private bubbleContent: Map<HTMLDivElement, string> = new Map();
	private modelBadge: HTMLDivElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: AIPulse) {
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
		contentEl.addClass("ai-pulse-chat-container");

		// --- Top region: Chat area ---
		const messagesArea = contentEl.createDiv({ cls: "ai-pulse-messages-area" });
		this.messageContainer = messagesArea.createDiv({ cls: "ai-pulse-messages" });

		// --- Model Badge (top left) ---
		this.modelBadge = messagesArea.createDiv({ cls: "ai-pulse-model-badge" });
		this.updateModelBadge();

		// --- FAB Speed Dial ---
		const fab = messagesArea.createDiv({ cls: "ai-pulse-fab" });

		// Main FAB trigger button (first child)
		const fabTrigger = fab.createEl("button", {
			cls: "ai-pulse-fab-trigger",
			attr: { "aria-label": "Actions", tabindex: "0" },
		});
		setIcon(fabTrigger, "settings");

		// Speed dial actions (revealed on focus-within)
		const settingsAction = fab.createDiv({ cls: "ai-pulse-fab-action" });
		const settingsLabel = settingsAction.createSpan({ cls: "ai-pulse-fab-label", text: "AI Settings" });
		void settingsLabel;
		const settingsBtn = settingsAction.createEl("button", {
			cls: "ai-pulse-fab-btn",
			attr: { "aria-label": "Settings" },
		});
		setIcon(settingsBtn, "sliders-horizontal");
		settingsBtn.addEventListener("click", () => {
			const modal = new SettingsModal(this.plugin);
			modal.onClose = () => {
				this.updateModelBadge();
			};
			modal.open();
			// Blur to close the FAB
			(document.activeElement as HTMLElement)?.blur();
		});

		const toolsAction = fab.createDiv({ cls: "ai-pulse-fab-action" });
		const toolsLabel = toolsAction.createSpan({ cls: "ai-pulse-fab-label", text: "Tools" });
		void toolsLabel;
		this.toolsButton = toolsAction.createEl("button", {
			cls: "ai-pulse-fab-btn",
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

		const clearAction = fab.createDiv({ cls: "ai-pulse-fab-action" });
		const clearLabel = clearAction.createSpan({ cls: "ai-pulse-fab-label", text: "Clear Chat" });
		void clearLabel;
		const clearBtn = clearAction.createEl("button", {
			cls: "ai-pulse-fab-btn",
			attr: { "aria-label": "Clear Chat" },
		});
		setIcon(clearBtn, "trash-2");
		clearBtn.addEventListener("click", () => {
			this.messages = [];
			this.bubbleContent.clear();
			if (this.messageContainer !== null) {
				this.messageContainer.empty();
			}
			(document.activeElement as HTMLElement)?.blur();
		});

		const inputRow = messagesArea.createDiv({ cls: "ai-pulse-input-row" });
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
		this.bubbleContent.clear();
		this.messageContainer = null;
		this.textarea = null;
		this.sendButton = null;
		this.toolsButton = null;
		this.modelBadge = null;
		this.abortController = null;
	}

	private getEnabledTools(): OllamaToolDefinition[] {
		const tools: OllamaToolDefinition[] = [];
		for (const tool of TOOL_REGISTRY) {
			if (tool.batchOf !== undefined) {
				// Batch tool: include if the parent tool is enabled
				if (this.plugin.settings.enabledTools[tool.batchOf] === true) {
					tools.push(tool.definition);
				}
			} else if (this.plugin.settings.enabledTools[tool.id] === true) {
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
		this.toolsButton.toggleClass("ai-pulse-tools-active", this.hasAnyToolEnabled());
	}

	private updateModelBadge(): void {
		if (this.modelBadge === null) return;
		const model = this.plugin.settings.model;
		if (model === "") {
			this.modelBadge.setText("No model selected");
			this.modelBadge.addClass("ai-pulse-model-badge-empty");
		} else {
			this.modelBadge.setText(model);
			this.modelBadge.removeClass("ai-pulse-model-badge-empty");
		}
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

		// Read custom system prompt from vault file if enabled
		let userSystemPrompt: string | undefined;
		if (this.plugin.settings.useSystemPromptFile) {
			const promptPath = this.plugin.settings.systemPromptFile;
			if (promptPath !== "") {
				const promptFile = this.plugin.app.vault.getAbstractFileByPath(promptPath);
				if (promptFile !== null && promptFile instanceof TFile) {
					try {
						userSystemPrompt = await this.plugin.app.vault.cachedRead(promptFile);
					} catch {
						// Silently skip if file can't be read
					}
				}
			}
		}

		// Build vault context if enabled
		let vaultContext: string | undefined;
		if (this.plugin.settings.injectVaultContext) {
			const ctx = collectVaultContext(
				this.plugin.app,
				this.plugin.settings.vaultContextRecentFiles,
			);
			vaultContext = formatVaultContext(ctx);
		}

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
					this.bubbleContent.delete(currentBubble);
					currentBubble.remove();
					currentBubble = null;
				}
				return this.showApprovalRequest(event);
			};

			const onCreateBubble = (): void => {
				// Finalize any previous bubble before creating a new one
				if (currentBubble !== null) {
					void this.finalizeBubble(currentBubble);
				}
				currentBubble = this.createStreamingBubble();
			};

			const onChunk = (chunk: string): void => {
				if (currentBubble !== null) {
					// Remove the loading indicator on first chunk
					const loadingIcon = currentBubble.querySelector(".ai-pulse-loading-icon");
					if (loadingIcon !== null) {
						loadingIcon.remove();
					}
					// Accumulate raw text for later markdown rendering
					const prev = this.bubbleContent.get(currentBubble) ?? "";
					this.bubbleContent.set(currentBubble, prev + chunk);
					currentBubble.appendText(chunk);
					this.debouncedScrollToBottom();
				}
			};

			const response = await sendChatMessageStreaming({
				ollamaUrl: this.plugin.settings.ollamaUrl,
				model: this.plugin.settings.model,
				messages: this.messages,
				...(hasTools ? { tools: enabledTools } : {}),
				...(hasTools ? { app: this.plugin.app } : {}),
				options: {
					temperature: this.plugin.settings.temperature,
					num_ctx: this.plugin.settings.numCtx,
					num_predict: this.plugin.settings.numPredict,
				},
				...(userSystemPrompt !== undefined ? { userSystemPrompt } : {}),
				...(vaultContext !== undefined ? { vaultContext } : {}),
				onChunk,
				...(hasTools ? { onToolCall } : {}),
				...(hasTools ? { onApprovalRequest } : {}),
				onCreateBubble,
				abortSignal: this.abortController.signal,
			});

			// Finalize the last streaming bubble
			if (currentBubble !== null) {
				await this.finalizeBubble(currentBubble);
			}
			this.messages.push({ role: "assistant", content: response });
			this.scrollToBottom();
		} catch (err: unknown) {
			const isAbort = err instanceof DOMException && err.name === "AbortError";

			// Clean up the streaming bubble
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
			const bubble = currentBubble as HTMLDivElement | null;
			if (bubble !== null) {
				bubble.removeClass("ai-pulse-streaming");
				const errorIcon = bubble.querySelector(".ai-pulse-loading-icon");
				if (errorIcon !== null) {
					errorIcon.remove();
				}
				// Remove empty bubble, or remove partial bubble on abort
				if (bubble.textContent?.trim() === "" || isAbort) {
					bubble.remove();
				}
				this.bubbleContent.delete(bubble);
			}

			// Only show error UI for real errors, not user-initiated aborts
			if (!isAbort) {
				const errMsg = err instanceof Error ? err.message : "Unknown error.";
				new Notice(errMsg);
				this.appendMessage("error", `Error: ${errMsg}`);
				this.scrollToBottom();
			}
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
			cls: "ai-pulse-message assistant ai-pulse-streaming",
		});
		// Add a loading indicator icon
		const iconSpan = bubble.createSpan({ cls: "ai-pulse-loading-icon" });
		setIcon(iconSpan, "more-horizontal");
		return bubble;
	}

	/**
	 * Finalize a streaming bubble: remove streaming state, render markdown,
	 * and clean up the accumulated content tracker.
	 */
	private async finalizeBubble(bubble: HTMLDivElement): Promise<void> {
		bubble.removeClass("ai-pulse-streaming");

		// Remove loading icon if still present
		const loadingIcon = bubble.querySelector(".ai-pulse-loading-icon");
		if (loadingIcon !== null) {
			loadingIcon.remove();
		}

		const rawText = this.bubbleContent.get(bubble) ?? "";
		this.bubbleContent.delete(bubble);

		// Remove empty bubbles (e.g., tool-only rounds with no content)
		if (rawText.trim() === "") {
			bubble.remove();
			return;
		}

		// Replace plain text with rendered markdown
		bubble.empty();
		bubble.removeClass("ai-pulse-streaming-text");
		bubble.addClass("ai-pulse-markdown");
		await MarkdownRenderer.render(
			this.plugin.app,
			rawText,
			bubble,
			"",
			this,
		);

		// Wire up internal [[wiki-links]] so they navigate on click
		bubble.querySelectorAll("a.internal-link").forEach((link) => {
			link.addEventListener("click", (evt) => {
				evt.preventDefault();
				const href = link.getAttribute("href");
				if (href !== null) {
					void this.plugin.app.workspace.openLinkText(href, "", false);
				}
			});
		});

		this.scrollToBottom();
	}

	private appendMessage(role: "user" | "assistant" | "error", content: string): void {
		if (this.messageContainer === null) {
			return;
		}

		const cls =
			role === "error"
				? "ai-pulse-message assistant error"
				: `ai-pulse-message ${role}`;

		this.messageContainer.createDiv({ cls, text: content });
	}

	private appendToolCall(event: ToolCallEvent): void {
		if (this.messageContainer === null) {
			return;
		}

		const container = this.messageContainer.createDiv({ cls: "ai-pulse-tool-call" });

		const header = container.createDiv({ cls: "ai-pulse-tool-call-header" });
		setIcon(header.createSpan({ cls: "ai-pulse-tool-call-icon" }), "wrench");
		header.createSpan({ text: event.friendlyName, cls: "ai-pulse-tool-call-name" });

		container.createDiv({ text: event.summary, cls: "ai-pulse-tool-call-summary" });
		const isError = event.result.startsWith("Error");
		if (isError) {
			container.addClass("ai-pulse-tool-call-error");
		}

		container.createDiv({ text: event.resultSummary, cls: "ai-pulse-tool-call-result-summary" });

		// DaisyUI-style collapse with checkbox
		const collapse = container.createDiv({ cls: "ai-pulse-collapse ai-pulse-collapse-arrow" });
		const collapseId = `tool-collapse-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		const checkbox = collapse.createEl("input", {
			type: "checkbox",
			attr: { id: collapseId },
		});
		checkbox.addClass("ai-pulse-collapse-toggle");
		const titleEl = collapse.createEl("label", {
			cls: "ai-pulse-collapse-title",
			attr: { for: collapseId },
			text: "Details",
		});
		void titleEl; // suppress unused warning

		const collapseContent = collapse.createDiv({ cls: "ai-pulse-collapse-content" });
		const contentInner = collapseContent.createDiv({ cls: "ai-pulse-collapse-content-inner" });

		if (event.toolName === "edit_file") {
			// For edit_file, show old_text / new_text in dedicated labeled blocks
			const filePath = typeof event.args['file_path'] === "string" ? event.args['file_path'] : "";
			const oldText = typeof event.args['old_text'] === "string" ? event.args['old_text'] : "";
			const newText = typeof event.args['new_text'] === "string" ? event.args['new_text'] : "";

			if (filePath !== "") {
				contentInner.createEl("div", { text: `File: ${filePath}`, cls: "ai-pulse-tool-call-label" });
			}

			contentInner.createEl("div", { text: "Old text:", cls: "ai-pulse-tool-call-label" });
			contentInner.createEl("pre", {
				text: oldText === "" ? "(empty — new file)" : oldText,
				cls: "ai-pulse-tool-call-args",
			});

			contentInner.createEl("div", { text: "New text:", cls: "ai-pulse-tool-call-label" });
			contentInner.createEl("pre", {
				text: newText,
				cls: "ai-pulse-tool-call-result",
			});
		} else {
			const argsStr = JSON.stringify(event.args, null, 2);
			contentInner.createEl("pre", { text: argsStr, cls: "ai-pulse-tool-call-args" });

			const resultPreview = event.result.length > 500
				? event.result.substring(0, 500) + "..."
				: event.result;
			contentInner.createEl("pre", { text: resultPreview, cls: "ai-pulse-tool-call-result" });
		}
	}

	private showApprovalRequest(event: ApprovalRequestEvent): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			if (this.messageContainer === null) {
				resolve(false);
				return;
			}

			const container = this.messageContainer.createDiv({ cls: "ai-pulse-approval" });

			const header = container.createDiv({ cls: "ai-pulse-approval-header" });
			setIcon(header.createSpan({ cls: "ai-pulse-approval-icon" }), "shield-alert");
			header.createSpan({ text: event.friendlyName, cls: "ai-pulse-approval-name" });

			container.createDiv({ text: event.message, cls: "ai-pulse-approval-message" });

			// Show details for review-worthy tools
			const detailTools = [
				"edit_file", "create_file", "set_frontmatter",
				"batch_delete_file", "batch_move_file", "batch_set_frontmatter", "batch_edit_file",
			];
			if (detailTools.includes(event.toolName)) {
				const collapse = container.createDiv({ cls: "ai-pulse-collapse ai-pulse-collapse-arrow" });
				const collapseId = `approval-collapse-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
				const checkbox = collapse.createEl("input", {
					type: "checkbox",
					attr: { id: collapseId, checked: "" },
				});
				checkbox.addClass("ai-pulse-collapse-toggle");
				checkbox.checked = true;

				const collapseTitleText = event.toolName === "create_file" ? "Review content"
					: event.toolName === "set_frontmatter" ? "Review properties"
					: event.toolName.startsWith("batch_") ? "Review all operations"
					: "Review changes";
				const titleEl = collapse.createEl("label", {
					cls: "ai-pulse-collapse-title",
					attr: { for: collapseId },
					text: collapseTitleText,
				});
				void titleEl;

				const collapseContent = collapse.createDiv({ cls: "ai-pulse-collapse-content" });
				const contentInner = collapseContent.createDiv({ cls: "ai-pulse-collapse-content-inner" });

				if (event.toolName === "edit_file") {
					const oldText = typeof event.args['old_text'] === "string" ? event.args['old_text'] : "";
					const newText = typeof event.args['new_text'] === "string" ? event.args['new_text'] : "";

					contentInner.createEl("div", { text: "Old text:", cls: "ai-pulse-tool-call-label" });
					contentInner.createEl("pre", {
						text: oldText === "" ? "(empty \u2014 new file)" : oldText,
						cls: "ai-pulse-tool-call-args",
					});

					contentInner.createEl("div", { text: "New text:", cls: "ai-pulse-tool-call-label" });
					contentInner.createEl("pre", {
						text: newText,
						cls: "ai-pulse-tool-call-result",
					});
				} else if (event.toolName === "set_frontmatter") {
					const props = event.args['properties'];
					const propsStr = typeof props === "object" && props !== null
						? JSON.stringify(props, null, 2)
						: typeof props === "string" ? props : "{}";

					contentInner.createEl("div", { text: "Properties to set:", cls: "ai-pulse-tool-call-label" });
					contentInner.createEl("pre", {
						text: propsStr,
						cls: "ai-pulse-tool-call-result",
					});
				} else if (event.toolName === "create_file") {
					const content = typeof event.args['content'] === "string" ? event.args['content'] : "";

					contentInner.createEl("div", { text: "Content:", cls: "ai-pulse-tool-call-label" });
					contentInner.createEl("pre", {
						text: content === "" ? "(empty file)" : content,
						cls: "ai-pulse-tool-call-result",
					});
				} else if (event.toolName === "batch_delete_file") {
					this.renderBatchDeleteApproval(contentInner, event.args);
				} else if (event.toolName === "batch_move_file") {
					this.renderBatchMoveApproval(contentInner, event.args);
				} else if (event.toolName === "batch_set_frontmatter") {
					this.renderBatchSetFrontmatterApproval(contentInner, event.args);
				} else if (event.toolName === "batch_edit_file") {
					this.renderBatchEditApproval(contentInner, event.args);
				}
			}

			const buttonRow = container.createDiv({ cls: "ai-pulse-approval-buttons" });

			const approveBtn = buttonRow.createEl("button", {
				text: "Approve",
				cls: "ai-pulse-approval-approve",
			});

			const declineBtn = buttonRow.createEl("button", {
				text: "Decline",
				cls: "ai-pulse-approval-decline",
			});

			const finalize = (approved: boolean): void => {
				approveBtn.disabled = true;
				declineBtn.disabled = true;
				container.addClass(approved ? "ai-pulse-approval-approved" : "ai-pulse-approval-declined");
				const statusEl = container.createDiv({ cls: "ai-pulse-approval-status" });
				statusEl.setText(approved ? "Approved" : "Declined");
				this.scrollToBottom();
				resolve(approved);
			};

			approveBtn.addEventListener("click", () => finalize(true));
			declineBtn.addEventListener("click", () => finalize(false));

			this.scrollToBottom();
		});
	}

	private renderBatchDeleteApproval(container: HTMLDivElement, args: Record<string, unknown>): void {
		let filePaths: unknown[] = [];
		if (Array.isArray(args['file_paths'])) {
			filePaths = args['file_paths'];
		} else if (typeof args['file_paths'] === "string") {
			try { filePaths = JSON.parse(args['file_paths']) as unknown[]; } catch { /* empty */ }
		}

		container.createEl("div", {
			text: `Files to delete (${filePaths.length}):`,
			cls: "ai-pulse-tool-call-label",
		});

		const list = container.createEl("ul", { cls: "ai-pulse-batch-list" });
		for (const fp of filePaths) {
			list.createEl("li", { text: typeof fp === "string" ? fp : "(invalid)" });
		}
	}

	private renderBatchMoveApproval(container: HTMLDivElement, args: Record<string, unknown>): void {
		let operations: unknown[] = [];
		if (Array.isArray(args['operations'])) {
			operations = args['operations'];
		} else if (typeof args['operations'] === "string") {
			try { operations = JSON.parse(args['operations']) as unknown[]; } catch { /* empty */ }
		}

		container.createEl("div", {
			text: `Files to move (${operations.length}):`,
			cls: "ai-pulse-tool-call-label",
		});

		const list = container.createEl("ul", { cls: "ai-pulse-batch-list" });
		for (const op of operations) {
			if (typeof op !== "object" || op === null) {
				list.createEl("li", { text: "(invalid entry)" });
				continue;
			}
			const o = op as Record<string, unknown>;
			const from = typeof o['file_path'] === "string" ? o['file_path'] : "?";
			const to = typeof o['new_path'] === "string" ? o['new_path'] : "?";
			const li = list.createEl("li");
			li.createSpan({ text: from, cls: "ai-pulse-batch-path" });
			li.createSpan({ text: " \u2192 " });
			li.createSpan({ text: to, cls: "ai-pulse-batch-path" });
		}
	}

	private renderBatchSetFrontmatterApproval(container: HTMLDivElement, args: Record<string, unknown>): void {
		let operations: unknown[] = [];
		if (Array.isArray(args['operations'])) {
			operations = args['operations'];
		} else if (typeof args['operations'] === "string") {
			try { operations = JSON.parse(args['operations']) as unknown[]; } catch { /* empty */ }
		}

		container.createEl("div", {
			text: `Frontmatter updates (${operations.length} file${operations.length === 1 ? "" : "s"}):`,
			cls: "ai-pulse-tool-call-label",
		});

		for (const op of operations) {
			if (typeof op !== "object" || op === null) {
				container.createEl("div", { text: "(invalid entry)", cls: "ai-pulse-tool-call-label" });
				continue;
			}
			const o = op as Record<string, unknown>;
			const fp = typeof o['file_path'] === "string" ? o['file_path'] : "?";

			let propsStr = "{}";
			if (typeof o['properties'] === "object" && o['properties'] !== null) {
				propsStr = JSON.stringify(o['properties'], null, 2);
			} else if (typeof o['properties'] === "string") {
				propsStr = o['properties'];
			}

			container.createEl("div", { text: fp, cls: "ai-pulse-tool-call-label ai-pulse-batch-file-header" });
			container.createEl("pre", { text: propsStr, cls: "ai-pulse-tool-call-result" });
		}
	}

	private renderBatchEditApproval(container: HTMLDivElement, args: Record<string, unknown>): void {
		let operations: unknown[] = [];
		if (Array.isArray(args['operations'])) {
			operations = args['operations'];
		} else if (typeof args['operations'] === "string") {
			try { operations = JSON.parse(args['operations']) as unknown[]; } catch { /* empty */ }
		}

		container.createEl("div", {
			text: `File edits (${operations.length} file${operations.length === 1 ? "" : "s"}):`,
			cls: "ai-pulse-tool-call-label",
		});

		for (const op of operations) {
			if (typeof op !== "object" || op === null) {
				container.createEl("div", { text: "(invalid entry)", cls: "ai-pulse-tool-call-label" });
				continue;
			}
			const o = op as Record<string, unknown>;
			const fp = typeof o['file_path'] === "string" ? o['file_path'] : "?";
			const oldText = typeof o['old_text'] === "string" ? o['old_text'] : "";
			const newText = typeof o['new_text'] === "string" ? o['new_text'] : "";

			container.createEl("div", { text: fp, cls: "ai-pulse-tool-call-label ai-pulse-batch-file-header" });

			container.createEl("div", { text: "Old text:", cls: "ai-pulse-tool-call-label" });
			container.createEl("pre", {
				text: oldText === "" ? "(empty \u2014 new file)" : oldText,
				cls: "ai-pulse-tool-call-args",
			});

			container.createEl("div", { text: "New text:", cls: "ai-pulse-tool-call-label" });
			container.createEl("pre", {
				text: newText,
				cls: "ai-pulse-tool-call-result",
			});
		}
	}

	private scrollToBottom(): void {
		if (this.messageContainer === null) return;
		const lastChild = this.messageContainer.lastElementChild;
		if (lastChild !== null) {
			requestAnimationFrame(() => {
				lastChild.scrollIntoView({ block: "end", behavior: "instant" });
			});
		}
	}

	private debouncedScrollToBottom(): void {
		if (this.scrollDebounceTimer !== null) return;
		this.scrollDebounceTimer = setTimeout(() => {
			this.scrollDebounceTimer = null;
			if (this.messageContainer === null) return;
			const lastChild = this.messageContainer.lastElementChild;
			if (lastChild !== null) {
				requestAnimationFrame(() => {
					lastChild.scrollIntoView({ block: "end", behavior: "instant" });
				});
			}
		}, 50);
	}

	private setStreamingState(streaming: boolean): void {
		if (this.textarea !== null) {
			this.textarea.disabled = streaming;
		}
		if (this.sendButton !== null) {
			this.sendButton.textContent = streaming ? "Stop" : "Send";
			this.sendButton.toggleClass("ai-pulse-stop-btn", streaming);
		}
	}
}
