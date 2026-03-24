import { getDefaultToolStates } from "./tools";

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
};
