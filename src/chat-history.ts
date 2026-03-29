import type { ChatMessage } from "./ollama-client";
import type { PersistedMessage } from "./settings";

export type { PersistedMessage } from "./settings";

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
