export interface AIOrganizerSettings {
	ollamaUrl: string;
	model: string;
}

export const DEFAULT_SETTINGS: AIOrganizerSettings = {
	ollamaUrl: "http://localhost:11434",
	model: "",
};
