import { getDefaultToolStates } from "./tools";

export interface AIOrganizerSettings {
	ollamaUrl: string;
	model: string;
	enabledTools: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: AIOrganizerSettings = {
	ollamaUrl: "http://localhost:11434",
	model: "",
	enabledTools: getDefaultToolStates(),
};
