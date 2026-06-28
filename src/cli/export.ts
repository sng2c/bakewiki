import fs from "node:fs/promises";
import path from "node:path";
import { initDb } from "../db/index.js";
import { runMigrations } from "../migrate.js";
import { listPages, getPage } from "../pages/store.js";

// DB → 로컬 마크다운 폴더 동기화 (덮어쓰기).
export async function exportCommand(dir: string): Promise<void> {
	const root = path.resolve(dir);
	await fs.mkdir(root, { recursive: true });

	const db = initDb();
	runMigrations(db);

	const list = await listPages(db, true); // 관리 도구이므로 전체
	let count = 0;

	for (const { slug } of list) {
		const page = await getPage(db, slug);
		if (!page) continue;
		const file = path.join(root, `${slug}.md`);
		await fs.mkdir(path.dirname(file), { recursive: true });
		await fs.writeFile(file, page.content, "utf8");
		count++;
	}

	console.log(`Exported ${count} file(s) to ${root}.`);
}
