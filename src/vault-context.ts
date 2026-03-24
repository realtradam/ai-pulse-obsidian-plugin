import type { App } from "obsidian";

/**
 * Collected vault context summary injected into the AI system prompt.
 */
export interface VaultContext {
	vaultName: string;
	totalNotes: number;
	totalFolders: number;
	folderTree: string;
	tagTaxonomy: string;
	recentFiles: string;
}

/**
 * Build a folder tree string from the vault.
 * Produces an indented tree like:
 *   /
 *   ├── folder-a/
 *   │   ├── subfolder/
 *   ├── folder-b/
 */
function buildFolderTree(app: App): string {
	const folders = app.vault.getAllFolders(true);
	// Build a map of parent → children folder names
	const tree = new Map<string, string[]>();

	for (const folder of folders) {
		if (folder.isRoot()) continue;
		const parentPath = folder.parent?.path ?? "/";
		const key = parentPath === "/" || parentPath === "" ? "/" : parentPath;
		if (!tree.has(key)) {
			tree.set(key, []);
		}
		tree.get(key)!.push(folder.path);
	}

	const lines: string[] = [];

	function walk(path: string, prefix: string): void {
		const children = tree.get(path) ?? [];
		children.sort();
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const isLast = i === children.length - 1;
			const connector = isLast ? "└── " : "├── ";
			const childPrefix = isLast ? "    " : "│   ";
			// Show just the folder name, not the full path
			const name = child.split("/").pop() ?? child;
			lines.push(`${prefix}${connector}${name}/`);
			walk(child, prefix + childPrefix);
		}
	}

	lines.push("/");
	walk("/", "");

	return lines.join("\n");
}

/**
 * Collect all tags in the vault with their usage counts.
 * Returns a formatted string like: #tag1 (12), #tag2 (8), ...
 */
function buildTagTaxonomy(app: App): string {
	const tagCounts = new Map<string, number>();
	const files = app.vault.getMarkdownFiles();

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		if (cache === null) continue;

		// Inline tags
		if (cache.tags !== undefined) {
			for (const tagEntry of cache.tags) {
				const tag = tagEntry.tag.toLowerCase();
				tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
			}
		}

		// Frontmatter tags
		if (cache.frontmatter?.tags !== undefined) {
			const fmTags = cache.frontmatter.tags;
			if (Array.isArray(fmTags)) {
				for (const raw of fmTags) {
					const tag = typeof raw === "string"
						? (raw.startsWith("#") ? raw.toLowerCase() : `#${raw.toLowerCase()}`)
						: "";
					if (tag !== "") {
						tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
					}
				}
			}
		}
	}

	if (tagCounts.size === 0) {
		return "No tags in vault.";
	}

	// Sort by count descending
	const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

	// Cap at 100 tags to avoid overwhelming context
	const maxTags = 100;
	const limited = sorted.slice(0, maxTags);
	const lines = limited.map(([tag, count]) => `${tag} (${count})`);
	const suffix = sorted.length > maxTags
		? `\n...and ${sorted.length - maxTags} more tags.`
		: "";

	return lines.join(", ") + suffix;
}

/**
 * Get the most recently modified files.
 */
function buildRecentFiles(app: App, maxFiles: number): string {
	const files = app.vault.getMarkdownFiles();

	// Sort by modification time descending
	const sorted = [...files].sort((a, b) => b.stat.mtime - a.stat.mtime);
	const limited = sorted.slice(0, maxFiles);

	if (limited.length === 0) {
		return "No notes in vault.";
	}

	return limited.map((f) => f.path).join("\n");
}

/**
 * Collect the full vault context summary.
 * This is cheap — all data comes from the metadata cache and vault indexes.
 */
export function collectVaultContext(app: App, maxRecentFiles: number): VaultContext {
	const markdownFiles = app.vault.getMarkdownFiles();
	const allFolders = app.vault.getAllFolders(false);

	return {
		vaultName: app.vault.getName(),
		totalNotes: markdownFiles.length,
		totalFolders: allFolders.length,
		folderTree: buildFolderTree(app),
		tagTaxonomy: buildTagTaxonomy(app),
		recentFiles: buildRecentFiles(app, maxRecentFiles),
	};
}

/**
 * Format the vault context into a system prompt block.
 */
export function formatVaultContext(ctx: VaultContext): string {
	return (
		"VAULT CONTEXT (auto-injected summary of the user's Obsidian vault):\n\n" +
		`Vault name: ${ctx.vaultName}\n` +
		`Total notes: ${ctx.totalNotes}\n` +
		`Total folders: ${ctx.totalFolders}\n\n` +
		"Folder structure:\n" +
		"```\n" +
		ctx.folderTree + "\n" +
		"```\n\n" +
		"Tags in use:\n" +
		ctx.tagTaxonomy + "\n\n" +
		"Recently modified notes:\n" +
		ctx.recentFiles
	);
}
