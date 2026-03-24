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
	requiresApproval: boolean;
	approvalMessage?: (args: Record<string, unknown>) => string;
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
 * Execute the "delete_file" tool.
 * Deletes a file by its vault path (moves to trash).
 */
async function executeDeleteFile(app: App, args: Record<string, unknown>): Promise<string> {
	const filePath = typeof args.file_path === "string" ? args.file_path : "";
	if (filePath === "") {
		return "Error: file_path parameter is required.";
	}

	const file = app.vault.getAbstractFileByPath(filePath);
	if (file === null || !(file instanceof TFile)) {
		return `Error: File not found at path "${filePath}".`;
	}

	try {
		await app.vault.trash(file, true);
		return `File "${filePath}" has been deleted (moved to system trash).`;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		return `Error deleting file: ${msg}`;
	}
}

/**
 * Execute the "get_current_note" tool.
 * Returns the vault-relative path of the currently active note.
 */
async function executeGetCurrentNote(app: App, _args: Record<string, unknown>): Promise<string> {
	const file = app.workspace.getActiveFile();
	if (file === null) {
		return "Error: No note is currently open.";
	}
	return file.path;
}

/**
 * Execute the "edit_file" tool.
 * Performs a find-and-replace on the file content using vault.process() for atomicity.
 */
async function executeEditFile(app: App, args: Record<string, unknown>): Promise<string> {
	const filePath = typeof args.file_path === "string" ? args.file_path : "";
	if (filePath === "") {
		return "Error: file_path parameter is required.";
	}

	const oldText = typeof args.old_text === "string" ? args.old_text : "";
	const newText = typeof args.new_text === "string" ? args.new_text : "";

	const file = app.vault.getAbstractFileByPath(filePath);
	if (file === null || !(file instanceof TFile)) {
		return `Error: File not found at path "${filePath}".`;
	}

	try {
		if (oldText === "") {
			// Empty old_text: only allowed when the file is empty (write initial content)
			let replaced = false;
			await app.vault.process(file, (data) => {
				if (data.length !== 0) {
					return data;
				}
				replaced = true;
				return newText;
			});

			if (!replaced) {
				return `Error: old_text is empty but "${filePath}" is not empty. You must read the file first with read_file and provide the exact text you want to replace as old_text.`;
			}

			return `Successfully wrote content to empty file "${filePath}".`;
		}

		let replaced = false;
		await app.vault.process(file, (data) => {
			if (!data.includes(oldText)) {
				return data;
			}
			replaced = true;
			return data.replace(oldText, newText);
		});

		if (!replaced) {
			return `Error: The specified old_text was not found in "${filePath}". Make sure you read the file first with read_file and copy the exact text.`;
		}

		return `Successfully edited "${filePath}".`;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		return `Error editing file: ${msg}`;
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
		requiresApproval: false,
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
				description: "Search for files in the Obsidian vault by name or path. Returns a list of exact file paths. Use these exact paths for any subsequent file operations.",
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
		requiresApproval: false,
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
				description: "Read the full text content of a file in the Obsidian vault. The file_path must be an exact path as returned by search_files.",
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
	{
		id: "delete_file",
		label: "Delete File",
		description: "Delete a file from the vault (requires approval).",
		friendlyName: "Delete File",
		requiresApproval: true,
		approvalMessage: (args) => {
			const filePath = typeof args.file_path === "string" ? args.file_path : "unknown";
			return `Delete "${filePath}"?`;
		},
		summarize: (args) => {
			const filePath = typeof args.file_path === "string" ? args.file_path : "";
			return `"/${filePath}"`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) {
				return result;
			}
			if (result.includes("declined")) {
				return "Declined by user";
			}
			return "File deleted";
		},
		definition: {
			type: "function",
			function: {
				name: "delete_file",
				description: "Delete a file from the Obsidian vault. The file is moved to the system trash. The file_path must be an exact path as returned by search_files. This action requires user approval.",
				parameters: {
					type: "object",
					required: ["file_path"],
					properties: {
						file_path: {
							type: "string",
							description: "The vault-relative path to the file to delete (e.g. 'folder/note.md').",
						},
					},
				},
			},
		},
		execute: executeDeleteFile,
	},
	{
		id: "get_current_note",
		label: "Get Current Note",
		description: "Get the file path of the currently open note.",
		friendlyName: "Get Current Note",
		requiresApproval: false,
		summarize: () => "Checking active note",
		summarizeResult: (result) => {
			if (result.startsWith("Error")) {
				return result;
			}
			return `"/${result}"`;
		},
		definition: {
			type: "function",
			function: {
				name: "get_current_note",
				description: "Get the vault-relative file path of the note currently open in the editor. Use this to find out which note the user is looking at. Returns an exact path that can be used with read_file or edit_file.",
				parameters: {
					type: "object",
					required: [],
					properties: {},
				},
			},
		},
		execute: executeGetCurrentNote,
	},
	{
		id: "edit_file",
		label: "Edit File",
		description: "Find and replace text in a vault file (requires approval).",
		friendlyName: "Edit File",
		requiresApproval: true,
		approvalMessage: (args) => {
			const filePath = typeof args.file_path === "string" ? args.file_path : "unknown";
			return `Edit "${filePath}"?`;
		},
		summarize: (args) => {
			const filePath = typeof args.file_path === "string" ? args.file_path : "";
			return `"/${filePath}"`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) {
				return result;
			}
			if (result.includes("declined")) {
				return "Declined by user";
			}
			return "File edited";
		},
		definition: {
			type: "function",
			function: {
				name: "edit_file",
				description: "Edit a file in the Obsidian vault by finding and replacing text. " +
					"IMPORTANT: You MUST call read_file on the target file BEFORE calling edit_file so you can see its exact current content. " +
					"Copy the exact text you want to change from the read_file output and use it as old_text. " +
					"old_text must match a passage in the file exactly (including whitespace and newlines). " +
					"Only the first occurrence of old_text is replaced with new_text. " +
					"SPECIAL CASE: If the file is empty (read_file returned no content), set old_text to an empty string to write initial content. " +
					"If old_text is empty but the file is NOT empty, the edit will be rejected. " +
					"The file_path must be an exact path from search_files or get_current_note. " +
					"This action requires user approval.",
				parameters: {
					type: "object",
					required: ["file_path", "old_text", "new_text"],
					properties: {
						file_path: {
							type: "string",
							description: "The vault-relative path to the file (e.g. 'folder/note.md').",
						},
						old_text: {
							type: "string",
							description: "The exact text to find in the file, copied verbatim from read_file output. Include enough surrounding lines to uniquely identify the location. Preserve all whitespace and newlines exactly. Only set to an empty string when the file itself is empty.",
						},
						new_text: {
							type: "string",
							description: "The text to replace old_text with. Use an empty string to delete the matched text.",
						},
					},
				},
			},
		},
		execute: executeEditFile,
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
