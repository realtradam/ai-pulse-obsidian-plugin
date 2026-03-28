import { App, TFile, Vault, WorkspaceLeaf } from "obsidian";
import type { Moment } from "moment";

const DATE_FORMAT = "YYYY-MM-DD";

/**
 * Computes the vault-relative path for a daily note.
 * Format: {rootFolder}/{YYYY}/{MM}/{DD}/{YYYY-MM-DD}.md
 */
export function getDailyNotePath(date: Moment, rootFolder: string): string {
	const year = date.format("YYYY");
	const month = date.format("MM");
	const day = date.format("DD");
	const filename = date.format(DATE_FORMAT);
	return `${rootFolder}/${year}/${month}/${day}/${filename}.md`;
}

/**
 * Looks up an existing daily note in the vault for the given date.
 * Returns null if the file does not exist.
 */
export function getDailyNote(
	app: App,
	date: Moment,
	rootFolder: string,
): TFile | null {
	const path = getDailyNotePath(date, rootFolder);
	return app.vault.getFileByPath(path);
}

/**
 * Creates a new daily note for the given date.
 * Creates parent folders ({rootFolder}/{YYYY}/{MM}/{DD}/) if they don't exist.
 * If a template path is provided and the template file exists, its content is
 * used with `{{date}}` placeholders replaced by the ISO date string.
 * Otherwise, a minimal file with date frontmatter is created.
 */
export async function createDailyNote(
	app: App,
	date: Moment,
	rootFolder: string,
	template?: string,
): Promise<TFile> {
	const path = getDailyNotePath(date, rootFolder);
	const dateStr = date.format(DATE_FORMAT);

	// Ensure parent folders exist
	const folderPath = path.substring(0, path.lastIndexOf("/"));
	await ensureFolderExists(app.vault, folderPath);

	// Resolve content
	let content: string;
	if (template !== undefined && template !== "") {
		const templateFile = app.vault.getFileByPath(template);
		if (templateFile !== null) {
			const raw = await app.vault.cachedRead(templateFile);
			content = raw.replace(/\{\{date\}\}/g, dateStr);
		} else {
			content = defaultDailyNoteContent(dateStr);
		}
	} else {
		content = defaultDailyNoteContent(dateStr);
	}

	return app.vault.create(path, content);
}

/**
 * Opens an existing daily note or creates one first, then opens it.
 * When `newLeaf` is true, opens in a new tab; otherwise reuses the current leaf.
 */
export async function openDailyNote(
	app: App,
	date: Moment,
	rootFolder: string,
	opts: { newLeaf: boolean },
	template?: string,
): Promise<void> {
	let file = getDailyNote(app, date, rootFolder);
	if (file === null) {
		file = await createDailyNote(app, date, rootFolder, template);
	}

	const leaf: WorkspaceLeaf = app.workspace.getLeaf(opts.newLeaf);
	await leaf.openFile(file);
}

/**
 * Scans the calendar root folder recursively and builds an index of all
 * daily notes, keyed by their ISO date string ("YYYY-MM-DD").
 *
 * Only files that match the expected `{YYYY}/{MM}/{DD}/{YYYY-MM-DD}.md`
 * structure within the root folder are included.
 */
export function indexDailyNotes(
	app: App,
	rootFolder: string,
): Map<string, TFile> {
	const index = new Map<string, TFile>();
	const root = app.vault.getFolderByPath(rootFolder);
	if (root === null) {
		return index;
	}

	// Pattern: rootFolder/YYYY/MM/DD/YYYY-MM-DD.md
	// After stripping rootFolder prefix, remainder is: YYYY/MM/DD/YYYY-MM-DD.md
	const datePathRegex = /^(\d{4})\/(\d{2})\/(\d{2})\/(\d{4}-\d{2}-\d{2})\.md$/;

	Vault.recurseChildren(root, (abstractFile) => {
		if (!(abstractFile instanceof TFile)) {
			return;
		}
		if (abstractFile.extension !== "md") {
			return;
		}

		const relativePath = abstractFile.path.substring(rootFolder.length + 1);
		const match = datePathRegex.exec(relativePath);
		if (match === null) {
			return;
		}

		const [, year, month, day, filename] = match;
		if (
			year === undefined ||
			month === undefined ||
			day === undefined ||
			filename === undefined
		) {
			return;
		}

		// Verify the folder components match the filename
		const expectedFilename = `${year}-${month}-${day}`;
		if (filename !== expectedFilename) {
			return;
		}

		// Validate it's a real date
		const m = window.moment(filename, DATE_FORMAT, true);
		if (!m.isValid()) {
			return;
		}

		index.set(filename, abstractFile);
	});

	return index;
}

/**
 * Given a TFile, determines whether it lives in the daily note folder
 * structure and extracts the date if so.
 * Returns null if the file is not a recognized daily note.
 */
export function getDateFromDailyNote(
	file: TFile,
	rootFolder: string,
): Moment | null {
	// File must be under the root folder
	if (!file.path.startsWith(rootFolder + "/")) {
		return null;
	}

	const relativePath = file.path.substring(rootFolder.length + 1);
	const datePathRegex = /^(\d{4})\/(\d{2})\/(\d{2})\/(\d{4}-\d{2}-\d{2})\.md$/;
	const match = datePathRegex.exec(relativePath);
	if (match === null) {
		return null;
	}

	const [, year, month, day, filename] = match;
	if (
		year === undefined ||
		month === undefined ||
		day === undefined ||
		filename === undefined
	) {
		return null;
	}

	const expectedFilename = `${year}-${month}-${day}`;
	if (filename !== expectedFilename) {
		return null;
	}

	const m = window.moment(filename, DATE_FORMAT, true);
	if (!m.isValid()) {
		return null;
	}

	return m;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively creates folders for the given path if they don't already exist.
 */
async function ensureFolderExists(vault: Vault, folderPath: string): Promise<void> {
	if (vault.getFolderByPath(folderPath) !== null) {
		return;
	}

	// Walk from root to deepest folder, creating each segment
	const segments = folderPath.split("/");
	let current = "";
	for (const segment of segments) {
		current = current === "" ? segment : `${current}/${segment}`;
		if (vault.getFolderByPath(current) === null) {
			await vault.createFolder(current);
		}
	}
}

/**
 * Returns the default content for a new daily note with date frontmatter.
 */
function defaultDailyNoteContent(dateStr: string): string {
	return `---\ndate: ${dateStr}\n---\n`;
}
