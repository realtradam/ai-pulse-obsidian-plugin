import { Plugin, WorkspaceLeaf } from "obsidian";
import { AIOrganizerSettings, DEFAULT_SETTINGS } from "./settings";
import { ChatView, VIEW_TYPE_CHAT } from "./chat-view";
import { testConnection, listModels } from "./ollama-client";
import { getDefaultToolStates } from "./tools";

export default class AIOrganizer extends Plugin {
	settings: AIOrganizerSettings = DEFAULT_SETTINGS;

	// Runtime connection state (not persisted)
	connectionStatus: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
	connectionMessage = "";
	availableModels: string[] = [];

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
			await this.loadData() as Partial<AIOrganizerSettings> | null,
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
