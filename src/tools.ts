import type { App } from "obsidian";
import { TFile } from "obsidian";

// Tool context JSON imports
import searchFilesCtx from "./context/tools/search-files.json";
import readFileCtx from "./context/tools/read-file.json";
import deleteFileCtx from "./context/tools/delete-file.json";
import getCurrentNoteCtx from "./context/tools/get-current-note.json";
import editFileCtx from "./context/tools/edit-file.json";
import grepSearchCtx from "./context/tools/grep-search.json";
import createFileCtx from "./context/tools/create-file.json";
import moveFileCtx from "./context/tools/move-file.json";
import setFrontmatterCtx from "./context/tools/set-frontmatter.json";
import batchSearchFilesCtx from "./context/tools/batch-search-files.json";
import batchGrepSearchCtx from "./context/tools/batch-grep-search.json";
import batchDeleteFileCtx from "./context/tools/batch-delete-file.json";
import batchMoveFileCtx from "./context/tools/batch-move-file.json";
import batchSetFrontmatterCtx from "./context/tools/batch-set-frontmatter.json";
import batchEditFileCtx from "./context/tools/batch-edit-file.json";

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
 * Shape of a tool context JSON file.
 */
interface ToolContext {
	id: string;
	label: string;
	description: string;
	friendlyName: string;
	requiresApproval: boolean;
	batchOf?: string;
	definition: OllamaToolDefinition;
}

/**
 * Cast a tool context JSON import to the ToolContext type.
 * The JSON imports are typed as their literal shapes; this asserts
 * they conform to the ToolContext interface at the boundary.
 */
function asToolContext(json: Record<string, unknown>): ToolContext {
	return json as unknown as ToolContext;
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
	const query = typeof args["query"] === "string" ? args["query"].toLowerCase() : "";
	if (query === "") {
		// Detect common misuse: model passed batch_search_files params to search_files
		if (args["queries"] !== undefined) {
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
	const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
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
	const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
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
	const query = typeof args["query"] === "string" ? args["query"] : "";
	if (query === "") {
		if (args["queries"] !== undefined) {
			return "Error: query parameter is required. You passed 'queries' (plural) — use grep_search with a single 'query' string, or use batch_grep_search for multiple queries.";
		}
		return "Error: query parameter is required.";
	}

	const filePattern = typeof args["file_pattern"] === "string" ? args["file_pattern"].toLowerCase() : "";
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
	const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
	if (filePath === "") {
		return "Error: file_path parameter is required.";
	}

	const content = typeof args["content"] === "string" ? args["content"] : "";

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
	const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
	if (filePath === "") {
		return "Error: file_path parameter is required.";
	}

	const newPath = typeof args["new_path"] === "string" ? args["new_path"] : "";
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
	const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
	if (filePath === "") {
		return "Error: file_path parameter is required.";
	}

	const oldText = typeof args["old_text"] === "string" ? args["old_text"] : "";
	const newText = typeof args["new_text"] === "string" ? args["new_text"] : "";

	// Reject no-op edits where old_text and new_text are identical
	if (oldText === newText) {
		return `Error: old_text and new_text are identical — no change would occur. Provide different text for new_text, or skip this edit.`;
	}

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
	const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
	if (filePath === "") {
		return "Error: file_path parameter is required.";
	}

	let properties = args["properties"];

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
	const queries = parseArrayArg(args["queries"]);
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
	const queries = parseArrayArg(args["queries"]);
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
		const queryText = typeof queryObj["query"] === "string" ? queryObj["query"] : "";
		const filePattern = typeof queryObj["file_pattern"] === "string" ? ` (in "${queryObj["file_pattern"]}")` : "";
		results.push(`--- Query ${i + 1}: "${queryText}"${filePattern} ---\n${result}`);
	}

	return results.join("\n\n");
}

/**
 * Execute the "batch_delete_file" tool.
 * Deletes multiple files, continuing on failure and reporting per-file results.
 */
async function executeBatchDeleteFile(app: App, args: Record<string, unknown>): Promise<string> {
	const filePaths = parseArrayArg(args["file_paths"]);
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
	const operations = parseArrayArg(args["operations"]);
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
		const filePath = typeof opObj["file_path"] === "string" ? opObj["file_path"] : "";
		const newPath = typeof opObj["new_path"] === "string" ? opObj["new_path"] : "";
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
	const operations = parseArrayArg(args["operations"]);
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
		const filePath = typeof opObj["file_path"] === "string" ? opObj["file_path"] : "";
		const result = await executeSetFrontmatter(app, { file_path: filePath, properties: opObj["properties"] });
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
	const operations = parseArrayArg(args["operations"]);
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
		const filePath = typeof opObj["file_path"] === "string" ? opObj["file_path"] : "";
		const result = await executeEditFile(app, {
			file_path: filePath,
			old_text: opObj["old_text"],
			new_text: opObj["new_text"],
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
 * Metadata (id, label, description, friendlyName, requiresApproval, batchOf, definition)
 * is loaded from JSON context files in src/context/tools/.
 * Only runtime logic (summarize, summarizeResult, approvalMessage, execute) is defined here.
 */
export const TOOL_REGISTRY: ToolEntry[] = [
	{
		...asToolContext(searchFilesCtx as Record<string, unknown>),
		summarize: (args) => {
			const query = typeof args["query"] === "string" ? args["query"] : "";
			if (query === "" && args["queries"] !== undefined) {
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
			const extraCount = moreMatch !== null ? parseInt(moreMatch[1] ?? "0", 10) : 0;
			const count = lines.length - (moreMatch !== null ? 1 : 0) + extraCount;
			return `${count} result${count === 1 ? "" : "s"} found`;
		},
		execute: executeSearchFiles,
	},
	{
		...asToolContext(readFileCtx as Record<string, unknown>),
		summarize: (args) => {
			const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
			return `"/${filePath}"`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) {
				return result;
			}
			const lines = result.split("\n").length;
			return `${lines} line${lines === 1 ? "" : "s"} read`;
		},
		execute: executeReadFile,
	},
	{
		...asToolContext(deleteFileCtx as Record<string, unknown>),
		approvalMessage: (args) => {
			const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "unknown";
			return `Delete "${filePath}"?`;
		},
		summarize: (args) => {
			const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
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
		execute: executeDeleteFile,
	},
	{
		...asToolContext(getCurrentNoteCtx as Record<string, unknown>),
		summarize: () => "Checking active note",
		summarizeResult: (result) => {
			if (result.startsWith("Error")) {
				return result;
			}
			return `"/${result}"`;
		},
		execute: executeGetCurrentNote,
	},
	{
		...asToolContext(editFileCtx as Record<string, unknown>),
		approvalMessage: (args) => {
			const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "unknown";
			return `Edit "${filePath}"?`;
		},
		summarize: (args) => {
			const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
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
		execute: executeEditFile,
	},
	{
		...asToolContext(grepSearchCtx as Record<string, unknown>),
		summarize: (args) => {
			const query = typeof args["query"] === "string" ? args["query"] : "";
			const filePattern = typeof args["file_pattern"] === "string" ? args["file_pattern"] : "";
			if (query === "" && args["queries"] !== undefined) {
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
			const count = cappedMatch !== null ? `${cappedMatch[1] ?? "?"}+` : `${lines.length}`;
			return `${count} match${lines.length === 1 ? "" : "es"} found`;
		},
		execute: executeGrepSearch,
	},
	{
		...asToolContext(createFileCtx as Record<string, unknown>),
		approvalMessage: (args) => {
			const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "unknown";
			return `Create "${filePath}"?`;
		},
		summarize: (args) => {
			const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
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
		execute: executeCreateFile,
	},
	{
		...asToolContext(moveFileCtx as Record<string, unknown>),
		approvalMessage: (args) => {
			const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "unknown";
			const newPath = typeof args["new_path"] === "string" ? args["new_path"] : "unknown";
			return `Move "${filePath}" to "${newPath}"?`;
		},
		summarize: (args) => {
			const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
			const newPath = typeof args["new_path"] === "string" ? args["new_path"] : "";
			return `"/${filePath}" \u2192 "/${newPath}"`;
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
		execute: executeMoveFile,
	},
	{
		...asToolContext(setFrontmatterCtx as Record<string, unknown>),
		approvalMessage: (args) => {
			const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "unknown";
			const props = typeof args["properties"] === "object" && args["properties"] !== null
				? Object.keys(args["properties"] as Record<string, unknown>)
				: [];
			return `Update frontmatter in "${filePath}"? Properties: ${props.join(", ")}`;
		},
		summarize: (args) => {
			const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
			const props = typeof args["properties"] === "object" && args["properties"] !== null
				? Object.keys(args["properties"] as Record<string, unknown>)
				: [];
			return `"/${filePath}" \u2014 ${props.join(", ")}`;
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
		execute: executeSetFrontmatter,
	},
	// --- Batch tools ---
	{
		...asToolContext(batchSearchFilesCtx as Record<string, unknown>),
		summarize: (args) => {
			const queries = parseArrayArg(args["queries"]);
			const count = queries !== null ? queries.length : 0;
			return `${count} search quer${count === 1 ? "y" : "ies"}`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) return result;
			const sections = result.split("--- Query").length - 1;
			return `${sections} search${sections === 1 ? "" : "es"} completed`;
		},
		execute: executeBatchSearchFiles,
	},
	{
		...asToolContext(batchGrepSearchCtx as Record<string, unknown>),
		summarize: (args) => {
			const queries = parseArrayArg(args["queries"]);
			const count = queries !== null ? queries.length : 0;
			return `${count} content search${count === 1 ? "" : "es"}`;
		},
		summarizeResult: (result) => {
			if (result.startsWith("Error")) return result;
			const sections = result.split("--- Query").length - 1;
			return `${sections} search${sections === 1 ? "" : "es"} completed`;
		},
		execute: executeBatchGrepSearch,
	},
	{
		...asToolContext(batchDeleteFileCtx as Record<string, unknown>),
		approvalMessage: (args) => {
			const filePaths = parseArrayArg(args["file_paths"]);
			if (filePaths === null || filePaths.length === 0) return "Delete files?";
			const list = filePaths.map((fp) => `  \u2022 ${typeof fp === "string" ? fp : "(invalid)"}`);
			return `Delete ${filePaths.length} file${filePaths.length === 1 ? "" : "s"}?\n${list.join("\n")}`;
		},
		summarize: (args) => {
			const filePaths = parseArrayArg(args["file_paths"]);
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
		execute: executeBatchDeleteFile,
	},
	{
		...asToolContext(batchMoveFileCtx as Record<string, unknown>),
		approvalMessage: (args) => {
			const operations = parseArrayArg(args["operations"]);
			if (operations === null || operations.length === 0) return "Move files?";
			const list = operations.map((op) => {
				if (typeof op !== "object" || op === null) return "  \u2022 (invalid entry)";
				const o = op as Record<string, unknown>;
				const from = typeof o["file_path"] === "string" ? o["file_path"] : "?";
				const to = typeof o["new_path"] === "string" ? o["new_path"] : "?";
				return `  \u2022 ${from} \u2192 ${to}`;
			});
			return `Move ${operations.length} file${operations.length === 1 ? "" : "s"}?\n${list.join("\n")}`;
		},
		summarize: (args) => {
			const operations = parseArrayArg(args["operations"]);
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
		execute: executeBatchMoveFile,
	},
	{
		...asToolContext(batchSetFrontmatterCtx as Record<string, unknown>),
		approvalMessage: (args) => {
			const operations = parseArrayArg(args["operations"]);
			if (operations === null || operations.length === 0) return "Update frontmatter?";
			const list = operations.map((op) => {
				if (typeof op !== "object" || op === null) return "  \u2022 (invalid entry)";
				const o = op as Record<string, unknown>;
				const fp = typeof o["file_path"] === "string" ? o["file_path"] : "?";
				let propsStr = "";
				if (typeof o["properties"] === "object" && o["properties"] !== null) {
					propsStr = Object.keys(o["properties"] as Record<string, unknown>).join(", ");
				} else if (typeof o["properties"] === "string") {
					try {
						const parsed = JSON.parse(o["properties"]) as Record<string, unknown>;
						propsStr = Object.keys(parsed).join(", ");
					} catch { propsStr = "(properties)"; }
				}
				return `  \u2022 ${fp}: ${propsStr}`;
			});
			return `Update frontmatter on ${operations.length} file${operations.length === 1 ? "" : "s"}?\n${list.join("\n")}`;
		},
		summarize: (args) => {
			const operations = parseArrayArg(args["operations"]);
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
		execute: executeBatchSetFrontmatter,
	},
	{
		...asToolContext(batchEditFileCtx as Record<string, unknown>),
		approvalMessage: (args) => {
			const operations = parseArrayArg(args["operations"]);
			if (operations === null || operations.length === 0) return "Edit files?";
			const list = operations.map((op) => {
				if (typeof op !== "object" || op === null) return "  \u2022 (invalid entry)";
				const o = op as Record<string, unknown>;
				const fp = typeof o["file_path"] === "string" ? o["file_path"] : "?";
				return `  \u2022 ${fp}`;
			});
			return `Edit ${operations.length} file${operations.length === 1 ? "" : "s"}?\n${list.join("\n")}`;
		},
		summarize: (args) => {
			const operations = parseArrayArg(args["operations"]);
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
