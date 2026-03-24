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

/**
 * Approval request event for tools that require user confirmation.
 */
export interface ApprovalRequestEvent {
	toolName: string;
	friendlyName: string;
	message: string;
	args: Record<string, unknown>;
}

export interface ModelOptions {
	temperature?: number;
	num_ctx?: number;
	num_predict?: number;
}

/**
 * Result returned by a chat request strategy.
 */
interface ChatRequestResult {
	content: string;
	toolCalls: ToolCallResponse[];
}

/**
 * A strategy function that performs a single HTTP request to the Ollama chat API.
 * Different implementations handle non-streaming, mobile fallback, and desktop streaming.
 */
type ChatRequestStrategy = (
	workingMessages: ChatMessage[],
) => Promise<ChatRequestResult>;

/**
 * Options for the shared agent loop.
 */
interface AgentLoopOptions {
	messages: ChatMessage[];
	tools?: OllamaToolDefinition[];
	app?: App;
	userSystemPrompt?: string;
	vaultContext?: string;
	onToolCall?: (event: ToolCallEvent) => void;
	onApprovalRequest?: (event: ApprovalRequestEvent) => Promise<boolean>;
	sendRequest: ChatRequestStrategy;
}

/**
 * System prompt injected when tools are available.
 */
const TOOL_SYSTEM_PROMPT =
	"You are a helpful assistant with access to tools for interacting with an Obsidian vault. " +
	"When you use the search_files tool, the results contain exact file paths. " +
	"You MUST use these exact paths when calling read_file, edit_file, or referencing files. " +
	"NEVER guess or modify file paths — always use the paths returned by search_files or get_current_note verbatim.\n\n" +
	"LINKING TO NOTES:\n" +
	"When you mention a note that exists in the vault, link to it using Obsidian's wiki-link syntax: [[Note Name]]. " +
	"Use the file's basename (without the .md extension and without folder prefixes) for simple links, e.g. [[My Note]]. " +
	"If you need to show different display text, use [[Note Name|display text]]. " +
	"Feel free to link to notes whenever it is helpful — for example when listing search results, suggesting related notes, or referencing files you have read or edited. " +
	"Links make your responses more useful because the user can click them to navigate directly to that note.\n\n" +
	"EDITING FILES — MANDATORY WORKFLOW:\n" +
	"The edit_file tool performs a find-and-replace. You provide old_text (the exact text currently in the file) and new_text (what to replace it with). " +
	"If old_text does not match the file contents exactly, the edit WILL FAIL.\n" +
	"Therefore you MUST follow this sequence every time you edit a file:\n" +
	"1. Get the file path (use search_files or get_current_note).\n" +
	"2. Call read_file to see the CURRENT content of the file.\n" +
	"3. Copy the exact text you want to change from the read_file output and use it as old_text.\n" +
	"4. Call edit_file with the correct old_text and your new_text.\n" +
	"NEVER skip step 2. NEVER guess what the file contains — always read it first.\n" +
	"If the file is empty (read_file returned no content), you may set old_text to an empty string to write initial content.\n" +
	"If the file is NOT empty, old_text MUST NOT be empty — copy the exact passage you want to change from the read_file output.\n" +
	"old_text must include enough surrounding context (a few lines) to uniquely identify the location in the file. " +
	"Preserve the exact whitespace, indentation, and newlines from the read_file output.\n\n" +
	"CREATING FILES:\n" +
	"Use create_file to make new notes. It will fail if the file already exists — use edit_file for existing files. " +
	"Parent folders are created automatically.\n\n" +
	"MOVING/RENAMING FILES:\n" +
	"Use move_file to move or rename a file. All [[wiki-links]] across the vault are automatically updated.\n\n" +
	"SEARCHING FILE CONTENTS:\n" +
	"Use grep_search to find text inside file contents (like grep). " +
	"Use search_files to find files by name/path. Use grep_search to find files containing specific text.\n\n" +
	"FRONTMATTER MANAGEMENT:\n" +
	"When you read a file with read_file, its YAML frontmatter is automatically included as a parsed JSON block at the top of the output. " +
	"Use set_frontmatter to add, update, or remove frontmatter properties (tags, aliases, categories, etc.). " +
	"set_frontmatter is MUCH safer than edit_file for metadata changes \u2014 it preserves YAML formatting. " +
	"ALWAYS prefer set_frontmatter over edit_file when modifying tags, aliases, or other frontmatter fields. " +
	"RECOMMENDED: Read the file first to see existing frontmatter before calling set_frontmatter.\n\n" +
	"Some tools (such as delete_file, edit_file, create_file, and move_file) require user approval before they execute. " +
	"If the user declines an action, ask them why so you can better assist them.";

/**
 * Shared agent loop: injects the system prompt, calls the strategy for each
 * iteration, executes tool calls, and loops until the model returns a final
 * text response or the iteration cap is reached.
 */
async function chatAgentLoop(opts: AgentLoopOptions): Promise<string> {
	const { messages, tools, app, userSystemPrompt, vaultContext, onToolCall, onApprovalRequest, sendRequest } = opts;
	const maxIterations = 10;
	let iterations = 0;

	const workingMessages = messages.map((m) => ({ ...m }));

	// Build combined system prompt from tool instructions + vault context + user custom prompt
	const hasTools = tools !== undefined && tools.length > 0;
	const hasUserPrompt = userSystemPrompt !== undefined && userSystemPrompt.trim() !== "";
	const hasVaultContext = vaultContext !== undefined && vaultContext.trim() !== "";

	if (hasTools || hasUserPrompt || hasVaultContext) {
		const parts: string[] = [];
		if (hasTools) {
			parts.push(TOOL_SYSTEM_PROMPT);
		}
		if (hasVaultContext) {
			parts.push(vaultContext);
		}
		if (hasUserPrompt) {
			parts.push("USER INSTRUCTIONS:\n" + userSystemPrompt.trim());
		}
		workingMessages.unshift({ role: "system", content: parts.join("\n\n") });
	}

	while (iterations < maxIterations) {
		iterations++;

		const { content, toolCalls } = await sendRequest(workingMessages);

		// No tool calls — return the final content
		if (toolCalls.length === 0) {
			return content;
		}

		// Append assistant message with tool_calls to working history
		workingMessages.push({
			role: "assistant",
			content,
			tool_calls: toolCalls,
		});

		if (app === undefined) {
			throw new Error("App reference required for tool execution.");
		}

		// Execute each tool call and append results
		for (const tc of toolCalls) {
			const fnName = tc.function.name;
			const fnArgs = tc.function.arguments;
			const toolEntry = findToolByName(fnName);

			let result: string;
			if (toolEntry === undefined) {
				result = `Error: Unknown tool "${fnName}".`;
			} else if (toolEntry.requiresApproval) {
				let approved = false;
				if (onApprovalRequest !== undefined) {
					const message = toolEntry.approvalMessage !== undefined
						? toolEntry.approvalMessage(fnArgs)
						: `Allow ${toolEntry.friendlyName}?`;
					approved = await onApprovalRequest({
						toolName: fnName,
						friendlyName: toolEntry.friendlyName,
						message,
						args: fnArgs,
					});
				}
				result = approved
					? await toolEntry.execute(app, fnArgs)
					: `Action declined by user: ${toolEntry.friendlyName} was not approved.`;
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
	}

	throw new Error("Tool calling loop exceeded maximum iterations.");
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

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
 * Model info returned by /api/show.
 */
export interface ModelInfo {
	contextLength: number;
}

/**
 * Query Ollama for model details, extracting the context length.
 * The context length is found in model_info under keys like
 * "<family>.context_length" or "context_length".
 */
export async function showModel(ollamaUrl: string, model: string): Promise<ModelInfo> {
	try {
		const response = await requestUrl({
			url: `${ollamaUrl}/api/show`,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model }),
		});

		const json = response.json as Record<string, unknown>;
		let contextLength = 4096; // fallback default

		const modelInfo = json.model_info as Record<string, unknown> | undefined;
		if (modelInfo !== undefined && modelInfo !== null) {
			for (const key of Object.keys(modelInfo)) {
				if (key.endsWith(".context_length") || key === "context_length") {
					const val = modelInfo[key];
					if (typeof val === "number" && val > 0) {
						contextLength = val;
						break;
					}
				}
			}
		}

		return { contextLength };
	} catch (err: unknown) {
		if (err instanceof Error) {
			throw new Error(`Failed to get model info: ${err.message}`);
		}
		throw new Error("Failed to get model info: unknown error.");
	}
}

// ---------------------------------------------------------------------------
// Non-streaming chat (requestUrl, no UI callbacks)
// ---------------------------------------------------------------------------

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
	onApprovalRequest?: (event: ApprovalRequestEvent) => Promise<boolean>,
	userSystemPrompt?: string,
	vaultContext?: string,
): Promise<string> {
	const sendRequest: ChatRequestStrategy = async (workingMessages) => {
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

			return { content, toolCalls };
		} catch (err: unknown) {
			if (err instanceof Error) {
				throw new Error(`Chat request failed: ${err.message}`);
			}
			throw new Error("Chat request failed: unknown error.");
		}
	};

	return chatAgentLoop({
		messages,
		tools,
		app,
		userSystemPrompt,
		vaultContext,
		onToolCall,
		onApprovalRequest,
		sendRequest,
	});
}

// ---------------------------------------------------------------------------
// Streaming chat
// ---------------------------------------------------------------------------

/**
 * Streaming chat options.
 */
export interface StreamingChatOptions {
	ollamaUrl: string;
	model: string;
	messages: ChatMessage[];
	tools?: OllamaToolDefinition[];
	app?: App;
	options?: ModelOptions;
	userSystemPrompt?: string;
	vaultContext?: string;
	onChunk: (text: string) => void;
	onToolCall?: (event: ToolCallEvent) => void;
	onApprovalRequest?: (event: ApprovalRequestEvent) => Promise<boolean>;
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
 * Streams text chunks via onChunk callback. Supports tool-calling agent loop.
 * Returns the full accumulated response text.
 *
 * On mobile platforms, falls back to non-streaming via Obsidian's requestUrl()
 * because native fetch() cannot reach local network addresses from the mobile
 * WebView sandbox.
 */
export async function sendChatMessageStreaming(
	opts: StreamingChatOptions,
): Promise<string> {
	const { ollamaUrl, model, tools, app, options, userSystemPrompt, vaultContext, onChunk, onToolCall, onApprovalRequest, onCreateBubble, abortSignal } = opts;

	const sendRequest: ChatRequestStrategy = Platform.isMobile
		? buildMobileStrategy(ollamaUrl, model, tools, options, onChunk, onCreateBubble)
		: buildDesktopStreamingStrategy(ollamaUrl, model, tools, options, onChunk, onCreateBubble, abortSignal);

	return chatAgentLoop({
		messages: opts.messages,
		tools,
		app,
		userSystemPrompt,
		vaultContext,
		onToolCall,
		onApprovalRequest,
		sendRequest,
	});
}

/**
 * Mobile strategy: uses Obsidian's requestUrl() (non-streaming) so the request
 * goes through the native networking layer and can reach localhost / LAN.
 * Delivers the full response as a single chunk.
 */
function buildMobileStrategy(
	ollamaUrl: string,
	model: string,
	tools: OllamaToolDefinition[] | undefined,
	options: ModelOptions | undefined,
	onChunk: (text: string) => void,
	onCreateBubble: () => void,
): ChatRequestStrategy {
	return async (workingMessages) => {
		onCreateBubble();

		const body: Record<string, unknown> = {
			model,
			messages: workingMessages,
			stream: false,
		};

		if (tools !== undefined && tools.length > 0) {
			body.tools = tools;
		}

		if (options !== undefined) {
			body.options = options;
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

			if (content !== "") {
				onChunk(content);
			}

			return { content, toolCalls };
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
	};
}

/**
 * Desktop streaming strategy: uses native fetch() for real token-by-token streaming.
 */
function buildDesktopStreamingStrategy(
	ollamaUrl: string,
	model: string,
	tools: OllamaToolDefinition[] | undefined,
	options: ModelOptions | undefined,
	onChunk: (text: string) => void,
	onCreateBubble: () => void,
	abortSignal?: AbortSignal,
): ChatRequestStrategy {
	return async (workingMessages) => {
		onCreateBubble();

		const body: Record<string, unknown> = {
			model,
			messages: workingMessages,
			stream: true,
		};

		if (tools !== undefined && tools.length > 0) {
			body.tools = tools;
		}

		if (options !== undefined) {
			body.options = options;
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
			throw new Error("Response body is null \u2014 streaming not supported.");
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
				return { content, toolCalls: [] };
			}
			throw err;
		}

		return { content, toolCalls };
	};
}
