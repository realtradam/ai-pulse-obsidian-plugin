import type { App } from "obsidian";
import { TFile } from "obsidian";

/**
 * Schema for an Ollama tool definition (function calling).
 */
export interface OllamaToolDefinition {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: {
			type: "object";
			required: string[];
			properties: Record<string, { type: string; description: string }>;
		};
	};
}

/**
 * Metadata for a tool the user can enable/disable.
 */
export interface ToolEntry {
	id: string;
	label: string;
	description: string;
	friendlyName: string;
	summarize: (args: Record<string, unknown>) => string;
	summarizeResult: (result: string) => string;
	definition: OllamaToolDefinition;
	execute: (app: App, args: Record<string, unknown>) => Promise<string>;
}

/**
 * Execute the "search_files" tool.
 * Returns a newline-separated list of vault file paths matching the query.
 */
async function executeSearchFiles(app: App, args: Record<string, unknown>): Promise<string> {
	const query = typeof args.query === "string" ? args.query.toLowerCase() : "";
	if (query === "") {
		return "Error: query parameter is required.";
	}

	const files = app.vault.getFiles();
	const matches: string[] = [];

	for (const file of files) {
		if (file.path.toLowerCase().includes(query)) {
			matches.push(file.path);
		}
	}

	if (matches.length === 0) {
		return "No files found matching the query.";
	}

	// Cap results to avoid overwhelming the context
	const maxResults = 50;
	const limited = matches.slice(0, maxResults);
	const suffix = matches.length > maxResults
		? `\n... and ${matches.length - maxResults} more results.`
		: "";

	return limited.join("\n") + suffix;
}

/**
 * Execute the "read_file" tool.
 * Returns the full text content of a file by its vault path.
 */
async function executeReadFile(app: App, args: Record<string, unknown>): Promise<string> {
	const filePath = typeof args.file_path === "string" ? args.file_path : "";
	if (filePath === "") {
		return "Error: file_path parameter is required.";
	}

	const file = app.vault.getAbstractFileByPath(filePath);
	if (file === null || !(file instanceof TFile)) {
		return `Error: File not found at path "${filePath}".`;
	}

	try {
		const content = await app.vault.cachedRead(file);
		return content;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		return `Error reading file: ${msg}`;
	}
}

/**
 * All available tools for the plugin.
 */
export const TOOL_REGISTRY: ToolEntry[] = [
	{
		id: "search_files",
		label: "Search File Names",
		description: "Search for files in the vault by name or path.",
		friendlyName: "Search Files",
		summarize: (args) => {
			const query = typeof args.query === "string" ? args.query : "";
			return `"${query}"`;
		},
		summarizeResult: (result) => {
			if (result === "No files found matching the query.") {
				return "No results found";
			}
			const lines = result.split("\n").filter((l) => l.length > 0);
			const moreMatch = result.match(/\.\.\.\s*and\s+(\d+)\s+more/);
			const extraCount = moreMatch !== null ? parseInt(moreMatch[1], 10) : 0;
			const count = lines.length - (moreMatch !== null ? 1 : 0) + extraCount;
			return `${count} result${count === 1 ? "" : "s"} found`;
		},
		definition: {
			type: "function",
			function: {
				name: "search_files",
				description: "Search for files in the Obsidian vault by name or path. Returns a list of matching file paths.",
				parameters: {
					type: "object",
					required: ["query"],
					properties: {
						query: {
							type: "string",
							description: "The search query to match against file names and paths.",
						},
					},
				},
			},
		},
		execute: executeSearchFiles,
	},
	{
		id: "read_file",
		label: "Read File Contents",
		description: "Read the full text content of a file in the vault.",
		friendlyName: "Read File",
		summarize: (args) => {
			const filePath = typeof args.file_path === "string" ? args.file_path : "";
			return `"/${filePath}"`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) {
				return result;
			}
			const lines = result.split("\n").length;
			return `${lines} line${lines === 1 ? "" : "s"} read`;
		},
		definition: {
			type: "function",
			function: {
				name: "read_file",
				description: "Read the full text content of a file in the Obsidian vault given its path.",
				parameters: {
					type: "object",
					required: ["file_path"],
					properties: {
						file_path: {
							type: "string",
							description: "The vault-relative path to the file (e.g. 'folder/note.md').",
						},
					},
				},
			},
		},
		execute: executeReadFile,
	},
];

/**
 * Get the default enabled state for all tools (all disabled).
 */
export function getDefaultToolStates(): Record<string, boolean> {
	const states: Record<string, boolean> = {};
	for (const tool of TOOL_REGISTRY) {
		states[tool.id] = false;
	}
	return states;
}

/**
 * Look up a tool entry by function name.
 */
export function findToolByName(name: string): ToolEntry | undefined {
	return TOOL_REGISTRY.find((t) => t.definition.function.name === name);
}
