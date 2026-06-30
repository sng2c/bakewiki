import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataDir, initDataDir, pagesDir, pageDir, indexPath, metaPath } from "../data.js";
import { parseDocument, extractTitle, readMeta, writeMeta } from "../pages/frontmatter.js";
import { upsertSearchIndex } from "../pages/search.js";

// 외부 .md 폴더 → 디렉토리 구조 동기화 (copy). 기존 페이지는 덮어쓰기.
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

	for (const file of files) {
		const slug = path.relative(src, file).replace(/\.md$/i, "").replace(/\\/g, "/");
		const dir = pageDir(resolvedDataDir, slug);
		await fs.mkdir(dir, { recursive: true });

		const raw = await fs.readFile(file, "utf-8");
		const doc = parseDocument(raw);
		const isPublic = doc.frontmatter?.public === false ? false : true;
		const fileStat = await fs.stat(file);
		const updatedAt = fileStat.mtime.toISOString();

		// index.md에 frontmatter 없는 본문 저장
		await fs.writeFile(indexPath(resolvedDataDir, slug), doc.body, "utf-8");

		// meta.yml에 메타 저장
		await writeMeta(metaPath(resolvedDataDir, slug), { public: isPublic, updatedAt });

		// 검색 인덱스 갱신
		const title = slug === "index" ? "index" : slug.split("/").pop()!;
		upsertSearchIndex(slug, extractTitle(doc) ?? title, doc.body, isPublic, updatedAt);

		created++;
	}

	console.log(`Imported ${created} page(s).`);
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