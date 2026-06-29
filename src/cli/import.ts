import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataDir, initDataDir } from "../data.js";
import { parseDocument, extractTitle, extractPublic } from "../pages/frontmatter.js";
import { upsertSearchIndex } from "../pages/search.js";

// 외부 .md 폴더 → pages 디렉토리 동기화 (copy). 기존 파일은 덮어쓰기.
export async function importCommand(dir: string, dataDir?: string): Promise<void> {
	const src = path.resolve(dir);
	const stat = await fs.stat(src).catch(() => null);
	if (!stat?.isDirectory()) {
		console.error(`Not a directory: ${src}`);
		process.exit(1);
	}

	const resolvedDataDir = resolveDataDir(dataDir);
	await initDataDir(resolvedDataDir);

	const files = await collectMarkdown(src);
	let created = 0;
	let updated = 0;

	for (const file of files) {
		const slug = path.relative(src, file).replace(/\.md$/i, "").replace(/\\/g, "/");
		const dest = path.join(resolvedDataDir, "pages", `${slug}.md`);
		const exists = await fs.access(dest).then(() => true).catch(() => false);
		await fs.mkdir(path.dirname(dest), { recursive: true });
		await fs.copyFile(file, dest);

		// 검색 인덱스 갱신
		const content = await fs.readFile(dest, "utf-8");
		const doc = parseDocument(content);
		const title = extractTitle(doc) ?? slug;
		const isPublic = extractPublic(doc);
		const fileStat = await fs.stat(dest);
		upsertSearchIndex(slug, title, content, isPublic, fileStat.mtime.toISOString());

		exists ? updated++ : created++;
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