import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataDir, pagesDir } from "../data.js";
import { parseDocument } from "../pages/frontmatter.js";
import { stringify as stringifyYaml } from "yaml";

// 디렉토리 구조 → 외부 폴더로 복사 (덮어쓰기).
// 각 페이지를 frontmatter 포함 .md 파일로 내보내기 (기존 형식과 호환).
export async function exportCommand(dir: string, dataDir?: string): Promise<void> {
	const dest = path.resolve(dir);
	await fs.mkdir(dest, { recursive: true });

	const resolvedDataDir = resolveDataDir(dataDir);
	const src = pagesDir(resolvedDataDir);

	// pages 디렉토리가 없으면 빈 상태
	try {
		await fs.access(src);
	} catch {
		console.log("No pages to export.");
		return;
	}

	const pages = await collectPages(src, src);
	let count = 0;

	for (const pageDir of pages) {
		const slug = path.relative(src, pageDir).replace(/\\/g, "/");
		const contentPath = path.join(pageDir, "index.md");
		const metaPathFile = path.join(pageDir, "meta.yml");

		let body: string;
		try {
			body = await fs.readFile(contentPath, "utf-8");
		} catch {
			continue; // index.md 없으면 스킵
		}

		// meta.yml에서 메타 읽기
		let isPublic = true;
		let updatedAt = new Date().toISOString();
		try {
			const metaContent = await fs.readFile(metaPathFile, "utf-8");
			const parsed = (await import("yaml")).parse(metaContent);
			if (parsed && typeof parsed === "object") {
				if (typeof parsed.public === "boolean") isPublic = parsed.public;
				if (typeof parsed.updatedAt === "string") updatedAt = parsed.updatedAt;
			}
		} catch {
			// meta.yml 없으면 기본값
		}

		// frontmatter 포함 .md 파일로 조립
		const fm = stringifyYaml({ public: isPublic }).trimEnd();
		const content = `---\n${fm}\n---\n${body}`;
		const target = path.join(dest, `${slug}.md`);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, content, "utf-8");
		count++;

		// 첨부 파일 복사 (index.md, meta.yml 제외)
		const entries = await fs.readdir(pageDir).catch(() => [] as string[]);
		for (const name of entries) {
			if (name === "index.md" || name === "meta.yml") continue;
			const srcFile = path.join(pageDir, name);
			try {
				const stat = await fs.stat(srcFile);
				if (!stat.isFile()) continue;
			} catch {
				continue;
			}
			// 첨부 파일을 uploads/{slug}/ 디렉토리에 복사
			const uploadDir = path.join(dest, "uploads", slug);
			await fs.mkdir(uploadDir, { recursive: true });
			await fs.copyFile(srcFile, path.join(uploadDir, name));
		}
	}

	console.log(`Exported ${count} page(s) to ${dest}.`);
}

// pages 디렉토리를 순회하며 index.md가 있는 디렉토리를 페이지로 인식.
async function collectPages(root: string, dir: string): Promise<string[]> {
	const out: string[] = [];
	async function walk(currentDir: string) {
		let entries: import("node:fs").Dirent[];
		try {
			entries = await fs.readdir(currentDir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			if (!e.isDirectory()) continue;
			const full = path.join(currentDir, e.name);
			const idxPath = path.join(full, "index.md");
			try {
				const stat = await fs.stat(idxPath);
				if (stat.isFile()) {
					out.push(full);
				}
			} catch {
				// index.md 없음 — 페이지 아님
			}
			await walk(full);
		}
	}
	await walk(dir);
	return out;
}