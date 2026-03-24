import { Platform, requestUrl } from "obsidian";
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
			if (msg.includes("net") || msg.includes("fetch") || msg.includes("failed to fetch") || msg.includes("load failed")) {
				if (Platform.isMobile) {
					throw new Error(
						"Ollama is unreachable. On mobile, use your computer's LAN IP " +
						"(e.g. http://192.168.1.x:11434) instead of localhost."
					);
				}
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

	// Inject a system prompt when tools are available to guide the model
	if (tools !== undefined && tools.length > 0) {
		const systemPrompt: ChatMessage = {
			role: "system",
			content:
				"You are a helpful assistant with access to tools for interacting with an Obsidian vault. " +
				"When you use the search_files tool, the results contain exact file paths. " +
				"You MUST use these exact paths when calling read_file or referencing files. " +
				"NEVER guess or modify file paths — always use the paths returned by search_files verbatim.",
		};
		workingMessages.unshift(systemPrompt);
	}

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

/**
 * Streaming chat options.
 */
export interface StreamingChatOptions {
	ollamaUrl: string;
	model: string;
	messages: ChatMessage[];
	tools?: OllamaToolDefinition[];
	app?: App;
	onChunk: (text: string) => void;
	onToolCall?: (event: ToolCallEvent) => void;
	onCreateBubble: () => void;
	abortSignal?: AbortSignal;
}

/**
 * Parse ndjson lines from a streamed response body.
 * Handles partial lines that may span across chunks from the reader.
 */
async function* readNdjsonStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	decoder: TextDecoder,
): AsyncGenerator<Record<string, unknown>> {
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		// Last element may be incomplete — keep it in buffer
		buffer = lines.pop() ?? "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed === "") continue;
			yield JSON.parse(trimmed) as Record<string, unknown>;
		}
	}

	// Process any remaining data in buffer
	const trimmed = buffer.trim();
	if (trimmed !== "") {
		yield JSON.parse(trimmed) as Record<string, unknown>;
	}
}

/**
 * Send a chat message with streaming.
 * Streams text chunks via onChunk callback. Supports tool-calling agent loop:
 * tool execution rounds are non-streamed, only the final text response streams.
 * Returns the full accumulated response text.
 *
 * On mobile platforms, falls back to non-streaming via Obsidian's requestUrl()
 * because native fetch() cannot reach local network addresses from the mobile
 * WebView sandbox.
 */
export async function sendChatMessageStreaming(
	opts: StreamingChatOptions,
): Promise<string> {
	if (Platform.isMobile) {
		return sendChatMessageStreamingMobile(opts);
	}
	return sendChatMessageStreamingDesktop(opts);
}

/**
 * Mobile fallback: uses Obsidian's requestUrl() (non-streaming) so the request
 * goes through the native networking layer and can reach localhost / LAN.
 */
async function sendChatMessageStreamingMobile(
	opts: StreamingChatOptions,
): Promise<string> {
	const { ollamaUrl, model, messages, tools, app, onChunk, onToolCall, onCreateBubble } = opts;
	const maxIterations = 10;
	let iterations = 0;

	const workingMessages = messages.map((m) => ({ ...m }));

	if (tools !== undefined && tools.length > 0) {
		const systemPrompt: ChatMessage = {
			role: "system",
			content:
				"You are a helpful assistant with access to tools for interacting with an Obsidian vault. " +
				"When you use the search_files tool, the results contain exact file paths. " +
				"You MUST use these exact paths when calling read_file or referencing files. " +
				"NEVER guess or modify file paths — always use the paths returned by search_files verbatim.",
		};
		workingMessages.unshift(systemPrompt);
	}

	while (iterations < maxIterations) {
		iterations++;

		onCreateBubble();

		const body: Record<string, unknown> = {
			model,
			messages: workingMessages,
			stream: false,
		};

		if (tools !== undefined && tools.length > 0) {
			body.tools = tools;
		}

		try {
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

			// Deliver the full content as a single chunk to the UI
			if (content !== "") {
				onChunk(content);
			}

			if (toolCalls.length === 0) {
				return content;
			}

			const assistantMsg: ChatMessage = {
				role: "assistant",
				content,
				tool_calls: toolCalls,
			};
			workingMessages.push(assistantMsg);

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
		} catch (err: unknown) {
			if (err instanceof Error) {
				const msg = err.message.toLowerCase();
				if (msg.includes("net") || msg.includes("fetch") || msg.includes("load") || msg.includes("failed")) {
					throw new Error(
						`Cannot reach Ollama at ${ollamaUrl}. ` +
						"On mobile, Ollama must be accessible over your network (not localhost). " +
						"Set the Ollama URL to your computer's LAN IP (e.g. http://192.168.1.x:11434)."
					);
				}
				throw new Error(`Chat request failed: ${err.message}`);
			}
			throw new Error("Chat request failed: unknown error.");
		}
	}

	throw new Error("Tool calling loop exceeded maximum iterations.");
}

/**
 * Desktop streaming: uses native fetch() for real token-by-token streaming.
 */
async function sendChatMessageStreamingDesktop(
	opts: StreamingChatOptions,
): Promise<string> {
	const { ollamaUrl, model, messages, tools, app, onChunk, onToolCall, onCreateBubble, abortSignal } = opts;
	const maxIterations = 10;
	let iterations = 0;

	const workingMessages = messages.map((m) => ({ ...m }));

	if (tools !== undefined && tools.length > 0) {
		const systemPrompt: ChatMessage = {
			role: "system",
			content:
				"You are a helpful assistant with access to tools for interacting with an Obsidian vault. " +
				"When you use the search_files tool, the results contain exact file paths. " +
				"You MUST use these exact paths when calling read_file or referencing files. " +
				"NEVER guess or modify file paths — always use the paths returned by search_files verbatim.",
		};
		workingMessages.unshift(systemPrompt);
	}

	while (iterations < maxIterations) {
		iterations++;

		onCreateBubble();

		const body: Record<string, unknown> = {
			model,
			messages: workingMessages,
			stream: true,
		};

		if (tools !== undefined && tools.length > 0) {
			body.tools = tools;
		}

		const response = await fetch(`${ollamaUrl}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: abortSignal,
		});

		if (!response.ok) {
			throw new Error(`Ollama returned status ${response.status}.`);
		}

		if (response.body === null) {
			throw new Error("Response body is null — streaming not supported.");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		let content = "";
		const toolCalls: ToolCallResponse[] = [];

		try {
			for await (const chunk of readNdjsonStream(reader, decoder)) {
				const msg = chunk.message as Record<string, unknown> | undefined;
				if (msg !== undefined && msg !== null) {
					if (typeof msg.content === "string" && msg.content !== "") {
						content += msg.content;
						onChunk(msg.content);
					}
					if (Array.isArray(msg.tool_calls)) {
						toolCalls.push(...(msg.tool_calls as ToolCallResponse[]));
					}
				}
			}
		} catch (err: unknown) {
			if (err instanceof DOMException && err.name === "AbortError") {
				return content;
			}
			throw err;
		}

		if (toolCalls.length === 0) {
			return content;
		}

		const assistantMsg: ChatMessage = {
			role: "assistant",
			content,
			tool_calls: toolCalls,
		};
		workingMessages.push(assistantMsg);

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
	}

	throw new Error("Tool calling loop exceeded maximum iterations.");
}
