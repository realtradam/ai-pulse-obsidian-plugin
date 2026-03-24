import { getDefaultToolStates } from "./tools";

export interface AIOrganizerSettings {
	ollamaUrl: string;
	model: string;
	enabledTools: Record<string, boolean>;
	temperature: number;
	numCtx: number;
	numPredict: number;
}

export const DEFAULT_SETTINGS: AIOrganizerSettings = {
	ollamaUrl: "http://localhost:11434",
	model: "",
	enabledTools: getDefaultToolStates(),
	temperature: 0.7,
	numCtx: 4096,
	numPredict: -1,
};
