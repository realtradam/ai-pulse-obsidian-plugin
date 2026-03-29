import type { App } from "obsidian";
import type { ChatMessage } from "./ollama-client";

/**
 * Stored chat history format.
 * Only user and assistant messages are persisted — system and tool messages
 * are transient (injected per-request by the agent loop).
 */
export interface ChatHistoryData {
	version: 1;
	messages: PersistedMessage[];
}

/**
 * A message stored in the chat history file.
 * This is a subset of ChatMessage — we strip tool_calls, tool_name,
 * and system/tool role messages since they are not meaningful across sessions.
 */
export interface PersistedMessage {
	role: "user" | "assistant";
	content: string;
}

const CHAT_HISTORY_FILENAME = "chat-history.json";

/**
 * Resolve the full path to the chat history file inside the plugin folder.
 */
function getHistoryPath(app: App, pluginId: string): string {
	return `${app.vault.configDir}/plugins/${pluginId}/${CHAT_HISTORY_FILENAME}`;
}

/**
 * Filter ChatMessage[] down to only persistable user/assistant messages.
 */
export function toPersistableMessages(messages: readonly ChatMessage[]): PersistedMessage[] {
	const result: PersistedMessage[] = [];
	for (const msg of messages) {
		if (msg.role === "user" || msg.role === "assistant") {
			result.push({ role: msg.role, content: msg.content });
		}
	}
	return result;
}

/**
 * Convert persisted messages back to ChatMessage[] for the LLM context.
 */
export function toRuntimeMessages(messages: readonly PersistedMessage[]): ChatMessage[] {
	return messages.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Load chat history from the plugin folder.
 * Returns an empty array if the file doesn't exist or is corrupted.
 */
export async function loadChatHistory(app: App, pluginId: string): Promise<PersistedMessage[]> {
	const path = getHistoryPath(app, pluginId);

	try {
		const exists = await app.vault.adapter.exists(path);
		if (!exists) {
			return [];
		}

		const raw = await app.vault.adapter.read(path);
		const parsed = JSON.parse(raw) as unknown;

		if (!isValidChatHistory(parsed)) {
			return [];
		}

		return parsed.messages;
	} catch {
		return [];
	}
}

/**
 * Save chat history to the plugin folder.
 */
export async function saveChatHistory(
	app: App,
	pluginId: string,
	messages: readonly ChatMessage[],
): Promise<void> {
	const path = getHistoryPath(app, pluginId);
	const persistable = toPersistableMessages(messages);

	const data: ChatHistoryData = {
		version: 1,
		messages: persistable,
	};

	await app.vault.adapter.write(path, JSON.stringify(data, null, 2));
}

/**
 * Clear the chat history by writing an empty messages array.
 * Writing an empty file rather than deleting ensures Obsidian Sync
 * propagates the "cleared" state to all devices.
 */
export async function clearChatHistory(app: App, pluginId: string): Promise<void> {
	const path = getHistoryPath(app, pluginId);

	const data: ChatHistoryData = {
		version: 1,
		messages: [],
	};

	try {
		await app.vault.adapter.write(path, JSON.stringify(data, null, 2));
	} catch {
		// Silently ignore — clear is best-effort
	}
}

/**
 * Type guard for validating the parsed chat history JSON.
 */
function isValidChatHistory(value: unknown): value is ChatHistoryData {
	if (typeof value !== "object" || value === null) return false;

	const obj = value as Record<string, unknown>;
	if (obj["version"] !== 1) return false;
	if (!Array.isArray(obj["messages"])) return false;

	for (const msg of obj["messages"]) {
		if (typeof msg !== "object" || msg === null) return false;
		const m = msg as Record<string, unknown>;
		if (m["role"] !== "user" && m["role"] !== "assistant") return false;
		if (typeof m["content"] !== "string") return false;
	}

	return true;
}
