import { Plugin, WorkspaceLeaf } from "obsidian";
import type { AIPulseSettings } from "./settings";
import { DEFAULT_SETTINGS } from "./settings";
import { ChatView, VIEW_TYPE_CHAT } from "./chat-view";
import { testConnection, listModels } from "./ollama-client";
import { getDefaultToolStates } from "./tools";
import { loadChatHistory } from "./chat-history";
import type { PersistedMessage } from "./chat-history";

export default class AIPulse extends Plugin {
	settings: AIPulseSettings = DEFAULT_SETTINGS;

	// Runtime connection state (not persisted)
	connectionStatus: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
	connectionMessage = "";
	availableModels: string[] = [];

	// Snapshot of persisted chat history for sync change detection
	private lastChatSnapshot = "";

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

		this.addRibbonIcon("message-square", "Open AI Chat", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-chat",
			name: "Open AI Chat",
			callback: () => {
				void this.activateView();
			},
		});

		// Detect chat history changes from Obsidian Sync or other devices.
		// We check when the app regains visibility (user switches back from another app/device).
		this.registerDomEvent(document, "visibilitychange", () => {
			if (document.visibilityState === "visible") {
				void this.checkChatHistorySync();
			}
		});
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
	}

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
		if (existing.length > 0) {
			const first = existing[0];
			if (first !== undefined) {
				this.app.workspace.revealLeaf(first);
			}
			return;
		}

		const leaf: WorkspaceLeaf | null = this.app.workspace.getRightLeaf(false);
		if (leaf === null) {
			return;
		}

		await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData() as Partial<AIPulseSettings> | null,
		);
		// Ensure enabledTools has entries for all registered tools
		this.settings.enabledTools = Object.assign(
			{},
			getDefaultToolStates(),
			this.settings.enabledTools,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Called by Obsidian when data.json is modified externally (e.g., via Sync).
	 * This is a strong signal that other plugin files may also have been synced.
	 */
	async onExternalSettingsChange(): Promise<void> {
		await this.loadSettings();
		void this.checkChatHistorySync();
	}

	/**
	 * Check if the persisted chat history has changed (e.g., from another device)
	 * and reload the chat view if needed.
	 */
	async checkChatHistorySync(): Promise<void> {
		try {
			const persisted = await loadChatHistory(this.app, this.manifest.id);
			const snapshot = buildChatSnapshot(persisted);

			if (snapshot === this.lastChatSnapshot) return;
			this.lastChatSnapshot = snapshot;

			// Find the active chat view and reload it
			const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
			for (const leaf of leaves) {
				const view = leaf.view;
				if (view instanceof ChatView) {
					void view.reloadChatHistory();
				}
			}
		} catch {
			// Silently ignore — sync check is best-effort
		}
	}

	/**
	 * Update the snapshot after a local save so we don't trigger a false reload.
	 */
	updateChatSnapshot(messages: PersistedMessage[]): void {
		this.lastChatSnapshot = buildChatSnapshot(messages);
	}

	async connect(): Promise<void> {
		this.connectionStatus = "connecting";
		this.connectionMessage = "Connecting...";
		this.availableModels = [];

		try {
			const version = await testConnection(this.settings.ollamaUrl);
			this.connectionMessage = `Connected — Ollama v${version}`;

			try {
				this.availableModels = await listModels(this.settings.ollamaUrl);
			} catch (modelErr: unknown) {
				const modelMsg =
					modelErr instanceof Error
						? modelErr.message
						: "Failed to list models.";
				this.connectionMessage = `Connected — Ollama v${version} (${modelMsg})`;
			}

			this.connectionStatus = "connected";
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.message : "Connection failed.";
			this.connectionMessage = errMsg;
			this.connectionStatus = "error";
		}
	}
}

/**
 * Build a lightweight snapshot string of chat messages for change detection.
 * Uses message count + last message content hash to detect changes
 * without deep comparison.
 */
function buildChatSnapshot(messages: PersistedMessage[]): string {
	if (messages.length === 0) return "empty";
	const last = messages[messages.length - 1];
	if (last === undefined) return "empty";
	return `${messages.length}:${last.role}:${last.content.length}:${last.content.slice(0, 100)}`;
}
