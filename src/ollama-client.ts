import { requestUrl } from "obsidian";

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export async function testConnection(ollamaUrl: string): Promise<string> {
	try {
		const response = await requestUrl({
			url: `${ollamaUrl}/api/version`,
			method: "GET",
			throw: false,
		});

		if (response.status === 200) {
			const version = (response.json as Record<string, unknown>).version;
			if (typeof version === "string") {
				return version;
			}
			throw new Error("Unexpected response format: missing version field.");
		}

		throw new Error(`Ollama returned status ${response.status}.`);
	} catch (err: unknown) {
		if (err instanceof Error) {
			const msg = err.message.toLowerCase();
			if (msg.includes("net") || msg.includes("fetch") || msg.includes("failed to fetch")) {
				throw new Error("Ollama is unreachable. Is the server running?");
			}
			throw err;
		}
		throw new Error("Ollama is unreachable. Is the server running?");
	}
}

export async function listModels(ollamaUrl: string): Promise<string[]> {
	try {
		const response = await requestUrl({
			url: `${ollamaUrl}/api/tags`,
			method: "GET",
		});

		const models = (response.json as Record<string, unknown>).models;
		if (!Array.isArray(models)) {
			throw new Error("Unexpected response format: missing models array.");
		}

		return models.map((m: unknown) => {
			if (typeof m === "object" && m !== null && "name" in m) {
				const name = (m as Record<string, unknown>).name;
				if (typeof name === "string") {
					return name;
				}
				return String(name);
			}
			return String(m);
		});
	} catch (err: unknown) {
		if (err instanceof Error) {
			throw new Error(`Failed to list models: ${err.message}`);
		}
		throw new Error("Failed to list models: unknown error.");
	}
}

export async function sendChatMessage(
	ollamaUrl: string,
	model: string,
	messages: ChatMessage[],
): Promise<string> {
	try {
		const response = await requestUrl({
			url: `${ollamaUrl}/api/chat`,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model, messages, stream: false }),
		});

		const message = (response.json as Record<string, unknown>).message;
		if (
			typeof message === "object" &&
			message !== null &&
			"content" in message &&
			typeof (message as Record<string, unknown>).content === "string"
		) {
			return (message as Record<string, unknown>).content as string;
		}

		throw new Error("Unexpected response format: missing message content.");
	} catch (err: unknown) {
		if (err instanceof Error) {
			throw new Error(`Chat request failed: ${err.message}`);
		}
		throw new Error("Chat request failed: unknown error.");
	}
}
