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
	/** If set, this batch tool is auto-enabled when the named base tool is enabled. */
	batchOf?: string;
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
		// Detect common misuse: model passed batch_search_files params to search_files
		if (args.queries !== undefined) {
			return "Error: query parameter is required. You passed 'queries' (plural) — use search_files with a single 'query' string, or use batch_search_files for multiple queries.";
		}
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
 * Returns the full text content of a file by its vault path,
 * plus parsed frontmatter as a JSON block if present.
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

		// Include parsed frontmatter as JSON if available
		const cache = app.metadataCache.getFileCache(file);
		if (cache?.frontmatter !== undefined) {
			const fm: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(cache.frontmatter)) {
				if (key !== "position") {
					fm[key] = value;
				}
			}
			const fmJson = JSON.stringify(fm, null, 2);
			return `--- FRONTMATTER (parsed) ---\n${fmJson}\n--- END FRONTMATTER ---\n\n--- FILE CONTENT ---\n${content}\n--- END FILE CONTENT ---`;
		}

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
 * Execute the "grep_search" tool.
 * Searches file contents for a text query, returning matching lines with context.
 */
async function executeGrepSearch(app: App, args: Record<string, unknown>): Promise<string> {
	const query = typeof args.query === "string" ? args.query : "";
	if (query === "") {
		if (args.queries !== undefined) {
			return "Error: query parameter is required. You passed 'queries' (plural) — use grep_search with a single 'query' string, or use batch_grep_search for multiple queries.";
		}
		return "Error: query parameter is required.";
	}

	const filePattern = typeof args.file_pattern === "string" ? args.file_pattern.toLowerCase() : "";
	const queryLower = query.toLowerCase();

	const files = app.vault.getMarkdownFiles();
	const results: string[] = [];
	const maxResults = 50;
	let totalMatches = 0;

	for (const file of files) {
		if (totalMatches >= maxResults) break;

		// Optional file pattern filter
		if (filePattern !== "" && !file.path.toLowerCase().includes(filePattern)) {
			continue;
		}

		try {
			const content = await app.vault.cachedRead(file);
			const lines = content.split("\n");

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (line !== undefined && line.toLowerCase().includes(queryLower)) {
					results.push(`${file.path}:${i + 1}: ${line.trim()}`);
					totalMatches++;
					if (totalMatches >= maxResults) break;
				}
			}
		} catch {
			// Skip files that can't be read
		}
	}

	if (results.length === 0) {
		return "No matches found.";
	}

	const suffix = totalMatches >= maxResults
		? `\n... results capped at ${maxResults}. Narrow your query for more specific results.`
		: "";

	return results.join("\n") + suffix;
}

/**
 * Execute the "create_file" tool.
 * Creates a new file at the given vault path with the provided content.
 */
async function executeCreateFile(app: App, args: Record<string, unknown>): Promise<string> {
	const filePath = typeof args.file_path === "string" ? args.file_path : "";
	if (filePath === "") {
		return "Error: file_path parameter is required.";
	}

	const content = typeof args.content === "string" ? args.content : "";

	// Check if file already exists
	const existing = app.vault.getAbstractFileByPath(filePath);
	if (existing !== null) {
		return `Error: A file already exists at "${filePath}". Use edit_file to modify it.`;
	}

	try {
		// Ensure parent folder exists
		const lastSlash = filePath.lastIndexOf("/");
		if (lastSlash > 0) {
			const folderPath = filePath.substring(0, lastSlash);
			const folder = app.vault.getFolderByPath(folderPath);
			if (folder === null) {
				await app.vault.createFolder(folderPath);
			}
		}

		await app.vault.create(filePath, content);
		return `File created at "${filePath}".`;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		return `Error creating file: ${msg}`;
	}
}

/**
 * Execute the "move_file" tool.
 * Moves or renames a file, auto-updating all links.
 */
async function executeMoveFile(app: App, args: Record<string, unknown>): Promise<string> {
	const filePath = typeof args.file_path === "string" ? args.file_path : "";
	if (filePath === "") {
		return "Error: file_path parameter is required.";
	}

	const newPath = typeof args.new_path === "string" ? args.new_path : "";
	if (newPath === "") {
		return "Error: new_path parameter is required.";
	}

	const file = app.vault.getAbstractFileByPath(filePath);
	if (file === null || !(file instanceof TFile)) {
		return `Error: File not found at path "${filePath}".`;
	}

	// Check if destination already exists
	const destExists = app.vault.getAbstractFileByPath(newPath);
	if (destExists !== null) {
		return `Error: A file or folder already exists at "${newPath}".`;
	}

	try {
		// Ensure target folder exists
		const lastSlash = newPath.lastIndexOf("/");
		if (lastSlash > 0) {
			const folderPath = newPath.substring(0, lastSlash);
			const folder = app.vault.getFolderByPath(folderPath);
			if (folder === null) {
				await app.vault.createFolder(folderPath);
			}
		}

		await app.fileManager.renameFile(file, newPath);
		return `File moved from "${filePath}" to "${newPath}". All links have been updated.`;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		return `Error moving file: ${msg}`;
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
 * Execute the "set_frontmatter" tool.
 * Atomically sets or updates frontmatter properties using processFrontMatter().
 * The `properties` argument is a JSON object whose keys are set/overwritten in the YAML block.
 * To remove a property, set its value to null.
 */
async function executeSetFrontmatter(app: App, args: Record<string, unknown>): Promise<string> {
	const filePath = typeof args.file_path === "string" ? args.file_path : "";
	if (filePath === "") {
		return "Error: file_path parameter is required.";
	}

	let properties = args.properties;

	// The model may pass properties as a JSON string — parse it
	if (typeof properties === "string") {
		try {
			properties = JSON.parse(properties) as unknown;
		} catch {
			return "Error: properties must be a valid JSON object. Failed to parse the string.";
		}
	}

	if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
		return "Error: properties must be a JSON object with key-value pairs.";
	}

	const propsObj = properties as Record<string, unknown>;
	if (Object.keys(propsObj).length === 0) {
		return "Error: properties object is empty. Provide at least one key to set.";
	}

	const file = app.vault.getAbstractFileByPath(filePath);
	if (file === null || !(file instanceof TFile)) {
		return `Error: File not found at path "${filePath}".`;
	}

	try {
		const keysSet: string[] = [];
		const keysRemoved: string[] = [];

		await app.fileManager.processFrontMatter(file, (fm) => {
			for (const [key, value] of Object.entries(propsObj)) {
				if (value === null) {
					// Remove the property
					if (key in fm) {
						delete fm[key];
						keysRemoved.push(key);
					}
				} else {
					fm[key] = value;
					keysSet.push(key);
				}
			}
		});

		const parts: string[] = [];
		if (keysSet.length > 0) {
			parts.push(`Set: ${keysSet.join(", ")}`);
		}
		if (keysRemoved.length > 0) {
			parts.push(`Removed: ${keysRemoved.join(", ")}`);
		}

		return `Frontmatter updated for "${filePath}". ${parts.join(". ")}.`;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		return `Error updating frontmatter: ${msg}`;
	}
}

// ---------------------------------------------------------------------------
// Batch tool execute functions
// ---------------------------------------------------------------------------

/**
 * Helper: parse an array-typed argument that may arrive as a JSON string.
 */
function parseArrayArg(value: unknown): unknown[] | null {
	if (Array.isArray(value)) return value;
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value) as unknown;
			if (Array.isArray(parsed)) return parsed;
		} catch { /* fall through */ }
	}
	return null;
}

/**
 * Execute the "batch_search_files" tool.
 * Runs multiple search queries and returns combined results.
 */
async function executeBatchSearchFiles(app: App, args: Record<string, unknown>): Promise<string> {
	const queries = parseArrayArg(args.queries);
	if (queries === null || queries.length === 0) {
		return "Error: queries parameter must be a non-empty array of strings.";
	}

	const results: string[] = [];
	for (let i = 0; i < queries.length; i++) {
		const q = queries[i];
		const query = typeof q === "string" ? q : "";
		const result = await executeSearchFiles(app, { query });
		results.push(`--- Query ${i + 1}: "${query}" ---\n${result}`);
	}

	return results.join("\n\n");
}

/**
 * Execute the "batch_grep_search" tool.
 * Runs multiple content searches and returns combined results.
 */
async function executeBatchGrepSearch(app: App, args: Record<string, unknown>): Promise<string> {
	const queries = parseArrayArg(args.queries);
	if (queries === null || queries.length === 0) {
		return "Error: queries parameter must be a non-empty array of search query objects.";
	}

	const results: string[] = [];
	for (let i = 0; i < queries.length; i++) {
		const q = queries[i];
		if (typeof q !== "object" || q === null) {
			results.push(`--- Query ${i + 1} ---\nError: each query must be an object with a "query" field.`);
			continue;
		}
		const queryObj = q as Record<string, unknown>;
		const result = await executeGrepSearch(app, queryObj);
		const queryText = typeof queryObj.query === "string" ? queryObj.query : "";
		const filePattern = typeof queryObj.file_pattern === "string" ? ` (in "${queryObj.file_pattern}")` : "";
		results.push(`--- Query ${i + 1}: "${queryText}"${filePattern} ---\n${result}`);
	}

	return results.join("\n\n");
}

/**
 * Execute the "batch_delete_file" tool.
 * Deletes multiple files, continuing on failure and reporting per-file results.
 */
async function executeBatchDeleteFile(app: App, args: Record<string, unknown>): Promise<string> {
	const filePaths = parseArrayArg(args.file_paths);
	if (filePaths === null || filePaths.length === 0) {
		return "Error: file_paths parameter must be a non-empty array of strings.";
	}

	const results: string[] = [];
	let successes = 0;
	let failures = 0;

	for (const fp of filePaths) {
		const filePath = typeof fp === "string" ? fp : "";
		const result = await executeDeleteFile(app, { file_path: filePath });
		if (result.startsWith("Error")) {
			failures++;
		} else {
			successes++;
		}
		results.push(`${filePath}: ${result}`);
	}

	const summary = `Batch delete complete: ${successes} succeeded, ${failures} failed.`;
	return `${summary}\n\n${results.join("\n")}`;
}

/**
 * Execute the "batch_move_file" tool.
 * Moves/renames multiple files, continuing on failure.
 */
async function executeBatchMoveFile(app: App, args: Record<string, unknown>): Promise<string> {
	const operations = parseArrayArg(args.operations);
	if (operations === null || operations.length === 0) {
		return "Error: operations parameter must be a non-empty array of {file_path, new_path} objects.";
	}

	const results: string[] = [];
	let successes = 0;
	let failures = 0;

	for (const op of operations) {
		if (typeof op !== "object" || op === null) {
			results.push("(invalid entry): Error: each operation must be an object with file_path and new_path.");
			failures++;
			continue;
		}
		const opObj = op as Record<string, unknown>;
		const filePath = typeof opObj.file_path === "string" ? opObj.file_path : "";
		const newPath = typeof opObj.new_path === "string" ? opObj.new_path : "";
		const result = await executeMoveFile(app, { file_path: filePath, new_path: newPath });
		if (result.startsWith("Error")) {
			failures++;
		} else {
			successes++;
		}
		results.push(`${filePath} → ${newPath}: ${result}`);
	}

	const summary = `Batch move complete: ${successes} succeeded, ${failures} failed.`;
	return `${summary}\n\n${results.join("\n")}`;
}

/**
 * Execute the "batch_set_frontmatter" tool.
 * Sets frontmatter on multiple files, continuing on failure.
 */
async function executeBatchSetFrontmatter(app: App, args: Record<string, unknown>): Promise<string> {
	const operations = parseArrayArg(args.operations);
	if (operations === null || operations.length === 0) {
		return "Error: operations parameter must be a non-empty array of {file_path, properties} objects.";
	}

	const results: string[] = [];
	let successes = 0;
	let failures = 0;

	for (const op of operations) {
		if (typeof op !== "object" || op === null) {
			results.push("(invalid entry): Error: each operation must be an object with file_path and properties.");
			failures++;
			continue;
		}
		const opObj = op as Record<string, unknown>;
		const filePath = typeof opObj.file_path === "string" ? opObj.file_path : "";
		const result = await executeSetFrontmatter(app, { file_path: filePath, properties: opObj.properties });
		if (result.startsWith("Error")) {
			failures++;
		} else {
			successes++;
		}
		results.push(`${filePath}: ${result}`);
	}

	const summary = `Batch frontmatter update complete: ${successes} succeeded, ${failures} failed.`;
	return `${summary}\n\n${results.join("\n")}`;
}

/**
 * Execute the "batch_edit_file" tool.
 * Performs multiple file edits, continuing on failure.
 */
async function executeBatchEditFile(app: App, args: Record<string, unknown>): Promise<string> {
	const operations = parseArrayArg(args.operations);
	if (operations === null || operations.length === 0) {
		return "Error: operations parameter must be a non-empty array of {file_path, old_text, new_text} objects.";
	}

	const results: string[] = [];
	let successes = 0;
	let failures = 0;

	for (const op of operations) {
		if (typeof op !== "object" || op === null) {
			results.push("(invalid entry): Error: each operation must be an object with file_path, old_text, and new_text.");
			failures++;
			continue;
		}
		const opObj = op as Record<string, unknown>;
		const filePath = typeof opObj.file_path === "string" ? opObj.file_path : "";
		const result = await executeEditFile(app, {
			file_path: filePath,
			old_text: opObj.old_text,
			new_text: opObj.new_text,
		});
		if (result.startsWith("Error")) {
			failures++;
		} else {
			successes++;
		}
		results.push(`${filePath}: ${result}`);
	}

	const summary = `Batch edit complete: ${successes} succeeded, ${failures} failed.`;
	return `${summary}\n\n${results.join("\n")}`;
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
			if (query === "" && args.queries !== undefined) {
				return "(wrong params: used 'queries' instead of 'query')";
			}
			return `"${query}"`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) {
				return result;
			}
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
				description: "Read the full text content of a file in the Obsidian vault. If the file has YAML frontmatter, it is also returned as a parsed JSON block at the top of the output. The file_path must be an exact path as returned by search_files.",
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
	{
		id: "grep_search",
		label: "Search File Contents",
		description: "Search for text across all markdown files in the vault.",
		friendlyName: "Search Contents",
		requiresApproval: false,
		summarize: (args) => {
			const query = typeof args.query === "string" ? args.query : "";
			const filePattern = typeof args.file_pattern === "string" ? args.file_pattern : "";
			if (query === "" && args.queries !== undefined) {
				return "(wrong params: used 'queries' instead of 'query')";
			}
			const suffix = filePattern !== "" ? ` in "${filePattern}"` : "";
			return `"${query}"${suffix}`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) {
				return result;
			}
			if (result === "No matches found.") {
				return "No results found";
			}
			const lines = result.split("\n").filter((l) => l.length > 0 && !l.startsWith("..."));
			const cappedMatch = result.match(/results capped at (\d+)/);
			const count = cappedMatch !== null ? `${cappedMatch[1]}+` : `${lines.length}`;
			return `${count} match${lines.length === 1 ? "" : "es"} found`;
		},
		definition: {
			type: "function",
			function: {
				name: "grep_search",
				description: "Search for a text string across all markdown file contents in the vault. Returns matching lines with file paths and line numbers (e.g. 'folder/note.md:12: matching line'). Case-insensitive. Optionally filter by file path pattern.",
				parameters: {
					type: "object",
					required: ["query"],
					properties: {
						query: {
							type: "string",
							description: "The text to search for in file contents. Case-insensitive.",
						},
						file_pattern: {
							type: "string",
							description: "Optional filter: only search files whose path contains this string (e.g. 'journal/' or 'project').",
						},
					},
				},
			},
		},
		execute: executeGrepSearch,
	},
	{
		id: "create_file",
		label: "Create File",
		description: "Create a new file in the vault (requires approval).",
		friendlyName: "Create File",
		requiresApproval: true,
		approvalMessage: (args) => {
			const filePath = typeof args.file_path === "string" ? args.file_path : "unknown";
			return `Create "${filePath}"?`;
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
			return "File created";
		},
		definition: {
			type: "function",
			function: {
				name: "create_file",
				description: "Create a new file in the Obsidian vault. Parent folders are created automatically if they don't exist. Fails if a file already exists at the path — use edit_file to modify existing files. This action requires user approval.",
				parameters: {
					type: "object",
					required: ["file_path"],
					properties: {
						file_path: {
							type: "string",
							description: "The vault-relative path for the new file (e.g. 'folder/new-note.md').",
						},
						content: {
							type: "string",
							description: "The text content to write to the new file. Defaults to empty string if not provided.",
						},
					},
				},
			},
		},
		execute: executeCreateFile,
	},
	{
		id: "move_file",
		label: "Move/Rename File",
		description: "Move or rename a file and auto-update all links (requires approval).",
		friendlyName: "Move File",
		requiresApproval: true,
		approvalMessage: (args) => {
			const filePath = typeof args.file_path === "string" ? args.file_path : "unknown";
			const newPath = typeof args.new_path === "string" ? args.new_path : "unknown";
			return `Move "${filePath}" to "${newPath}"?`;
		},
		summarize: (args) => {
			const filePath = typeof args.file_path === "string" ? args.file_path : "";
			const newPath = typeof args.new_path === "string" ? args.new_path : "";
			return `"/${filePath}" → "/${newPath}"`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) {
				return result;
			}
			if (result.includes("declined")) {
				return "Declined by user";
			}
			return "File moved";
		},
		definition: {
			type: "function",
			function: {
				name: "move_file",
				description: "Move or rename a file in the Obsidian vault. All internal links throughout the vault are automatically updated to reflect the new path. Target folders are created automatically if they don't exist. The file_path must be an exact path as returned by search_files. This action requires user approval.",
				parameters: {
					type: "object",
					required: ["file_path", "new_path"],
					properties: {
						file_path: {
							type: "string",
							description: "The current vault-relative path of the file (e.g. 'folder/note.md').",
						},
						new_path: {
							type: "string",
							description: "The new vault-relative path for the file (e.g. 'new-folder/renamed-note.md').",
						},
					},
				},
			},
		},
		execute: executeMoveFile,
	},
	{
		id: "set_frontmatter",
		label: "Set Frontmatter",
		description: "Add or update YAML frontmatter properties (requires approval).",
		friendlyName: "Set Frontmatter",
		requiresApproval: true,
		approvalMessage: (args) => {
			const filePath = typeof args.file_path === "string" ? args.file_path : "unknown";
			const props = typeof args.properties === "object" && args.properties !== null
				? Object.keys(args.properties as Record<string, unknown>)
				: [];
			return `Update frontmatter in "${filePath}"? Properties: ${props.join(", ")}`;
		},
		summarize: (args) => {
			const filePath = typeof args.file_path === "string" ? args.file_path : "";
			const props = typeof args.properties === "object" && args.properties !== null
				? Object.keys(args.properties as Record<string, unknown>)
				: [];
			return `"/${filePath}" — ${props.join(", ")}`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) {
				return result;
			}
			if (result.includes("declined")) {
				return "Declined by user";
			}
			return "Frontmatter updated";
		},
		definition: {
			type: "function",
			function: {
				name: "set_frontmatter",
				description: "Add or update YAML frontmatter properties on a note. " +
					"Pass a JSON object of key-value pairs to set. " +
					"Existing properties not mentioned are left unchanged. " +
					"Set a value to null to remove that property. " +
					"Use this for tags, aliases, categories, dates, or any custom metadata. " +
					"For tags, use an array of strings (e.g. [\"ai\", \"research\"]). " +
					"This is safer than edit_file for metadata changes because it preserves YAML formatting. " +
					"RECOMMENDED: Call read_file first to see existing frontmatter before updating. " +
					"The file_path must be an exact path from search_files or get_current_note. " +
					"This action requires user approval.",
				parameters: {
					type: "object",
					required: ["file_path", "properties"],
					properties: {
						file_path: {
							type: "string",
							description: "The vault-relative path to the file (e.g. 'folder/note.md').",
						},
						properties: {
							type: "string",
							description: 'A JSON object of frontmatter key-value pairs to set. Example: {"tags": ["ai", "research"], "category": "notes", "status": "draft"}. Set a value to null to remove that property.',
						},
					},
				},
			},
		},
		execute: executeSetFrontmatter,
	},
	// --- Batch tools ---
	{
		id: "batch_search_files",
		label: "Batch Search File Names",
		description: "Run multiple file-name searches in one call.",
		friendlyName: "Batch Search Files",
		requiresApproval: false,
		batchOf: "search_files",
		summarize: (args) => {
			const queries = parseArrayArg(args.queries);
			const count = queries !== null ? queries.length : 0;
			return `${count} search quer${count === 1 ? "y" : "ies"}`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) return result;
			const sections = result.split("--- Query").length - 1;
			return `${sections} search${sections === 1 ? "" : "es"} completed`;
		},
		definition: {
			type: "function",
			function: {
				name: "batch_search_files",
				description: "Run multiple file-name searches in a single call. Each query searches vault file names/paths independently. Use this when you need to search for several different terms at once instead of calling search_files repeatedly.",
				parameters: {
					type: "object",
					required: ["queries"],
					properties: {
						queries: {
							type: "string",
							description: 'A JSON array of search query strings. Example: ["meeting notes", "project plan", "2024"]',
						},
					},
				},
			},
		},
		execute: executeBatchSearchFiles,
	},
	{
		id: "batch_grep_search",
		label: "Batch Search File Contents",
		description: "Run multiple content searches in one call.",
		friendlyName: "Batch Search Contents",
		requiresApproval: false,
		batchOf: "grep_search",
		summarize: (args) => {
			const queries = parseArrayArg(args.queries);
			const count = queries !== null ? queries.length : 0;
			return `${count} content search${count === 1 ? "" : "es"}`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) return result;
			const sections = result.split("--- Query").length - 1;
			return `${sections} search${sections === 1 ? "" : "es"} completed`;
		},
		definition: {
			type: "function",
			function: {
				name: "batch_grep_search",
				description: "Run multiple content searches across vault markdown files in a single call. Each query searches independently. Use this when you need to search for several different text patterns at once instead of calling grep_search repeatedly.",
				parameters: {
					type: "object",
					required: ["queries"],
					properties: {
						queries: {
							type: "string",
							description: 'A JSON array of query objects. Each object must have a "query" field and optionally a "file_pattern" field. Example: [{"query": "TODO", "file_pattern": "projects/"}, {"query": "meeting agenda"}]',
						},
					},
				},
			},
		},
		execute: executeBatchGrepSearch,
	},
	{
		id: "batch_delete_file",
		label: "Batch Delete Files",
		description: "Delete multiple files at once (requires approval).",
		friendlyName: "Batch Delete Files",
		requiresApproval: true,
		batchOf: "delete_file",
		approvalMessage: (args) => {
			const filePaths = parseArrayArg(args.file_paths);
			if (filePaths === null || filePaths.length === 0) return "Delete files?";
			const list = filePaths.map((fp) => `  • ${typeof fp === "string" ? fp : "(invalid)"}`);
			return `Delete ${filePaths.length} file${filePaths.length === 1 ? "" : "s"}?\n${list.join("\n")}`;
		},
		summarize: (args) => {
			const filePaths = parseArrayArg(args.file_paths);
			const count = filePaths !== null ? filePaths.length : 0;
			return `${count} file${count === 1 ? "" : "s"}`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) return result;
			if (result.includes("declined")) return "Declined by user";
			const match = result.match(/(\d+) succeeded, (\d+) failed/);
			if (match !== null) return `${match[1]} deleted, ${match[2]} failed`;
			return "Batch delete complete";
		},
		definition: {
			type: "function",
			function: {
				name: "batch_delete_file",
				description: "Delete multiple files from the Obsidian vault in a single call. Files are moved to the system trash. If some files fail (e.g. not found), the operation continues with the remaining files and reports per-file results. All file paths must be exact paths as returned by search_files. This action requires user approval for the entire batch.",
				parameters: {
					type: "object",
					required: ["file_paths"],
					properties: {
						file_paths: {
							type: "string",
							description: 'A JSON array of vault-relative file paths to delete. Example: ["folder/note1.md", "folder/note2.md"]',
						},
					},
				},
			},
		},
		execute: executeBatchDeleteFile,
	},
	{
		id: "batch_move_file",
		label: "Batch Move/Rename Files",
		description: "Move or rename multiple files at once (requires approval).",
		friendlyName: "Batch Move Files",
		requiresApproval: true,
		batchOf: "move_file",
		approvalMessage: (args) => {
			const operations = parseArrayArg(args.operations);
			if (operations === null || operations.length === 0) return "Move files?";
			const list = operations.map((op) => {
				if (typeof op !== "object" || op === null) return "  • (invalid entry)";
				const o = op as Record<string, unknown>;
				const from = typeof o.file_path === "string" ? o.file_path : "?";
				const to = typeof o.new_path === "string" ? o.new_path : "?";
				return `  • ${from} → ${to}`;
			});
			return `Move ${operations.length} file${operations.length === 1 ? "" : "s"}?\n${list.join("\n")}`;
		},
		summarize: (args) => {
			const operations = parseArrayArg(args.operations);
			const count = operations !== null ? operations.length : 0;
			return `${count} file${count === 1 ? "" : "s"}`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) return result;
			if (result.includes("declined")) return "Declined by user";
			const match = result.match(/(\d+) succeeded, (\d+) failed/);
			if (match !== null) return `${match[1]} moved, ${match[2]} failed`;
			return "Batch move complete";
		},
		definition: {
			type: "function",
			function: {
				name: "batch_move_file",
				description: "Move or rename multiple files in the Obsidian vault in a single call. All internal links are automatically updated for each file. If some operations fail, the rest continue and per-file results are reported. Target folders are created automatically. All file paths must be exact paths as returned by search_files. This action requires user approval for the entire batch.",
				parameters: {
					type: "object",
					required: ["operations"],
					properties: {
						operations: {
							type: "string",
							description: 'A JSON array of move operations. Each object must have "file_path" (current path) and "new_path" (destination). Example: [{"file_path": "old/note.md", "new_path": "new/note.md"}, {"file_path": "a.md", "new_path": "archive/a.md"}]',
						},
					},
				},
			},
		},
		execute: executeBatchMoveFile,
	},
	{
		id: "batch_set_frontmatter",
		label: "Batch Set Frontmatter",
		description: "Update frontmatter on multiple files at once (requires approval).",
		friendlyName: "Batch Set Frontmatter",
		requiresApproval: true,
		batchOf: "set_frontmatter",
		approvalMessage: (args) => {
			const operations = parseArrayArg(args.operations);
			if (operations === null || operations.length === 0) return "Update frontmatter?";
			const list = operations.map((op) => {
				if (typeof op !== "object" || op === null) return "  • (invalid entry)";
				const o = op as Record<string, unknown>;
				const fp = typeof o.file_path === "string" ? o.file_path : "?";
				let propsStr = "";
				if (typeof o.properties === "object" && o.properties !== null) {
					propsStr = Object.keys(o.properties as Record<string, unknown>).join(", ");
				} else if (typeof o.properties === "string") {
					try {
						const parsed = JSON.parse(o.properties) as Record<string, unknown>;
						propsStr = Object.keys(parsed).join(", ");
					} catch { propsStr = "(properties)"; }
				}
				return `  • ${fp}: ${propsStr}`;
			});
			return `Update frontmatter on ${operations.length} file${operations.length === 1 ? "" : "s"}?\n${list.join("\n")}`;
		},
		summarize: (args) => {
			const operations = parseArrayArg(args.operations);
			const count = operations !== null ? operations.length : 0;
			return `${count} file${count === 1 ? "" : "s"}`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) return result;
			if (result.includes("declined")) return "Declined by user";
			const match = result.match(/(\d+) succeeded, (\d+) failed/);
			if (match !== null) return `${match[1]} updated, ${match[2]} failed`;
			return "Batch frontmatter update complete";
		},
		definition: {
			type: "function",
			function: {
				name: "batch_set_frontmatter",
				description: "Update YAML frontmatter properties on multiple files in a single call. " +
					"Each operation specifies a file and the properties to set. " +
					"Existing properties not mentioned are left unchanged. Set a value to null to remove it. " +
					"If some operations fail, the rest continue and per-file results are reported. " +
					"Use this instead of calling set_frontmatter repeatedly when updating multiple files. " +
					"RECOMMENDED: Read files first to see existing frontmatter before updating. " +
					"This action requires user approval for the entire batch.",
				parameters: {
					type: "object",
					required: ["operations"],
					properties: {
						operations: {
							type: "string",
							description: 'A JSON array of frontmatter operations. Each object must have "file_path" and "properties" (a JSON object of key-value pairs). Example: [{"file_path": "note1.md", "properties": {"tags": ["ai"], "status": "done"}}, {"file_path": "note2.md", "properties": {"tags": ["research"]}}]',
						},
					},
				},
			},
		},
		execute: executeBatchSetFrontmatter,
	},
	{
		id: "batch_edit_file",
		label: "Batch Edit Files",
		description: "Edit multiple files at once (requires approval).",
		friendlyName: "Batch Edit Files",
		requiresApproval: true,
		batchOf: "edit_file",
		approvalMessage: (args) => {
			const operations = parseArrayArg(args.operations);
			if (operations === null || operations.length === 0) return "Edit files?";
			const list = operations.map((op) => {
				if (typeof op !== "object" || op === null) return "  • (invalid entry)";
				const o = op as Record<string, unknown>;
				const fp = typeof o.file_path === "string" ? o.file_path : "?";
				return `  • ${fp}`;
			});
			return `Edit ${operations.length} file${operations.length === 1 ? "" : "s"}?\n${list.join("\n")}`;
		},
		summarize: (args) => {
			const operations = parseArrayArg(args.operations);
			const count = operations !== null ? operations.length : 0;
			return `${count} file${count === 1 ? "" : "s"}`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) return result;
			if (result.includes("declined")) return "Declined by user";
			const match = result.match(/(\d+) succeeded, (\d+) failed/);
			if (match !== null) return `${match[1]} edited, ${match[2]} failed`;
			return "Batch edit complete";
		},
		definition: {
			type: "function",
			function: {
				name: "batch_edit_file",
				description: "Edit multiple files in the Obsidian vault in a single call. " +
					"Each operation performs a find-and-replace on one file. " +
					"IMPORTANT: You MUST call read_file on each target file BEFORE using this tool. " +
					"Copy the exact text from read_file output for each old_text. " +
					"If some operations fail, the rest continue and per-file results are reported. " +
					"Use this instead of calling edit_file repeatedly when making changes across multiple files. " +
					"This action requires user approval for the entire batch.",
				parameters: {
					type: "object",
					required: ["operations"],
					properties: {
						operations: {
							type: "string",
							description: 'A JSON array of edit operations. Each object must have "file_path", "old_text", and "new_text". Example: [{"file_path": "note1.md", "old_text": "old content", "new_text": "new content"}, {"file_path": "note2.md", "old_text": "foo", "new_text": "bar"}]',
						},
					},
				},
			},
		},
		execute: executeBatchEditFile,
	},
];

/**
 * Get the default enabled state for all tools (all disabled).
 */
export function getDefaultToolStates(): Record<string, boolean> {
	const states: Record<string, boolean> = {};
	for (const tool of TOOL_REGISTRY) {
		// Batch tools inherit from their parent — no separate toggle
		if (tool.batchOf !== undefined) continue;
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
