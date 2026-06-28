import fs from "node:fs/promises";
import path from "node:path";
import { initDb } from "../db/index.js";
import { runMigrations } from "../migrate.js";
import { createPage, updatePage, getPage } from "../pages/store.js";

// 로컬 마크다운 폴더 → DB 동기화 (upsert). .md 파일만.
export async function importCommand(dir: string): Promise<void> {
	const root = path.resolve(dir);
	const stat = await fs.stat(root).catch(() => null);
	if (!stat?.isDirectory()) {
		console.error(`Not a directory: ${root}`);
		process.exit(1);
	}

	const db = initDb();
	runMigrations(db);

	const files = await collectMarkdown(root);
	let created = 0;
	let updated = 0;

	for (const file of files) {
		const rel = path.relative(root, file);
		const slug = rel.replace(/\.md$/i, "").replace(/\\/g, "/");
		const content = await fs.readFile(file, "utf8");
		const existing = await getPage(db, slug);
		if (existing) {
			await updatePage(db, slug, content);
			updated++;
		} else {
			await createPage(db, slug, content);
			created++;
		}
	}

	console.log(`Imported ${files.length} file(s): ${created} created, ${updated} updated.`);
}

async function collectMarkdown(root: string): Promise<string[]> {
	const out: string[] = [];
	async function walk(dir: string) {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const e of entries) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) {
				await walk(full);
			} else if (e.isFile() && /\.md$/i.test(e.name)) {
				out.push(full);
			}
		}
	}
	await walk(root);
	return out;
}
