import { getDefaultToolStates } from "./tools";

/**
 * A message stored in the persisted chat history.
 * Only user and assistant messages are persisted — system and tool messages
 * are transient (injected per-request by the agent loop).
 */
export interface PersistedMessage {
	role: "user" | "assistant";
	content: string;
}

export interface AIPulseSettings {
	ollamaUrl: string;
	model: string;
	enabledTools: Record<string, boolean>;
	temperature: number;
	numCtx: number;
	numPredict: number;
	useSystemPromptFile: boolean;
	systemPromptFile: string;
	injectVaultContext: boolean;
	vaultContextRecentFiles: number;
	chatHistory: PersistedMessage[];
}

export const DEFAULT_SETTINGS: AIPulseSettings = {
	ollamaUrl: "http://localhost:11434",
	model: "",
	enabledTools: getDefaultToolStates(),
	temperature: 0.7,
	numCtx: 4096,
	numPredict: -1,
	useSystemPromptFile: false,
	systemPromptFile: "agent.md",
	injectVaultContext: false,
	vaultContextRecentFiles: 20,
	chatHistory: [],
};
