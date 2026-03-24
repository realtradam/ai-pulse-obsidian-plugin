import { requestUrl } from "obsidian";
import type { App } from "obsidian";
import type { OllamaToolDefinition } from "./tools";
import { findToolByName } from "./tools";

export interface ChatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	tool_calls?: ToolCallResponse[];
	tool_name?: string;
}

export interface ToolCallResponse {
	type?: string;
	function: {
		index?: number;
		name: string;
		arguments: Record<string, unknown>;
	};
}

export interface ToolCallEvent {
	toolName: string;
	friendlyName: string;
	summary: string;
	resultSummary: string;
	args: Record<string, unknown>;
	result: string;
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

/**
 * Send a chat message with optional tool-calling agent loop.
 * When tools are provided, the function handles the multi-turn tool
 * execution loop automatically and calls onToolCall for each invocation.
 */
export async function sendChatMessage(
	ollamaUrl: string,
	model: string,
	messages: ChatMessage[],
	tools?: OllamaToolDefinition[],
	app?: App,
	onToolCall?: (event: ToolCallEvent) => void,
): Promise<string> {
	const maxIterations = 10;
	let iterations = 0;

	const workingMessages = messages.map((m) => ({ ...m }));

	while (iterations < maxIterations) {
		iterations++;

		try {
			const body: Record<string, unknown> = {
				model,
				messages: workingMessages,
				stream: false,
			};

			if (tools !== undefined && tools.length > 0) {
				body.tools = tools;
			}

			const response = await requestUrl({
				url: `${ollamaUrl}/api/chat`,
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			const messageObj = (response.json as Record<string, unknown>).message;
			if (typeof messageObj !== "object" || messageObj === null) {
				throw new Error("Unexpected response format: missing message.");
			}

			const msg = messageObj as Record<string, unknown>;
			const content = typeof msg.content === "string" ? msg.content : "";
			const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls as ToolCallResponse[] : [];

			// If no tool calls, return the final content
			if (toolCalls.length === 0) {
				return content;
			}

			// Append assistant message with tool_calls to working history
			const assistantMsg: ChatMessage = {
				role: "assistant",
				content,
				tool_calls: toolCalls,
			};
			workingMessages.push(assistantMsg);

			// Execute each tool call and append results
			if (app === undefined) {
				throw new Error("App reference required for tool execution.");
			}

			for (const tc of toolCalls) {
				const fnName = tc.function.name;
				const fnArgs = tc.function.arguments;
				const toolEntry = findToolByName(fnName);

				let result: string;
				if (toolEntry === undefined) {
					result = `Error: Unknown tool "${fnName}".`;
				} else {
					result = await toolEntry.execute(app, fnArgs);
				}

				if (onToolCall !== undefined) {
					const friendlyName = toolEntry !== undefined ? toolEntry.friendlyName : fnName;
					const summary = toolEntry !== undefined ? toolEntry.summarize(fnArgs) : `Called ${fnName}`;
					const resultSummary = toolEntry !== undefined ? toolEntry.summarizeResult(result) : "";
					onToolCall({ toolName: fnName, friendlyName, summary, resultSummary, args: fnArgs, result });
				}

				workingMessages.push({
					role: "tool",
					tool_name: fnName,
					content: result,
				});
			}

			// Loop continues — model sees tool results
		} catch (err: unknown) {
			if (err instanceof Error) {
				throw new Error(`Chat request failed: ${err.message}`);
			}
			throw new Error("Chat request failed: unknown error.");
		}
	}

	throw new Error("Tool calling loop exceeded maximum iterations.");
}
