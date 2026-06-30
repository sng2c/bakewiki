#!/usr/bin/env node
/**
 * bakewiki Title=Slug 마이그레이션 스크립트
 *
 * 기존 frontmatter title → 본문 첫 # 헤딩으로 이동
 * 슬러그를 title에서 유도한 이름으로 변경
 * index 페이지는 특수 케이스로 유지
 *
 * 사용법: node scripts/migrate-title-slug.mjs [--data ./data] [--dry-run]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const args = process.argv.slice(2);
const dataIdx = args.indexOf("--data");
const dataDir = path.resolve(
	dataIdx >= 0 && dataIdx + 1 < args.length ? args[dataIdx + 1] : (process.env.BAKEWIKI_DATA_DIR || "./data")
);
const dryRun = args.includes("--dry-run");

console.log(`Data directory: ${dataDir}`);
console.log(`Dry run: ${dryRun}`);
console.log("---");

const pagesDir = path.join(dataDir, "pages");
const uploadsDir = path.join(dataDir, "uploads");

// 타이틀을 슬러그 세그먼트로 변환 (store.ts의 slugifyTitle와 동일)
function slugifyTitle(title) {
	return title
		.replace(/\//g, "-")
		.replace(/\s+/g, "-")
		.replace(/#+/g, "")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

// GFM 문서 파싱
function parseDocument(raw) {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { frontmatter: null, body: raw };
	const [, yaml, body] = match;
	let frontmatter = null;
	try {
		const parsed = parseYaml(yaml);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			frontmatter = parsed;
		}
	} catch {
		frontmatter = null;
	}
	return { frontmatter, body };
}

// title 추출 (기존 로직: frontmatter.title > 첫 # 헤딩)
function extractOldTitle(doc) {
	const fmTitle = doc.frontmatter?.title;
	if (typeof fmTitle === "string" && fmTitle.trim()) return fmTitle.trim();
	const heading = doc.body.match(/^#\s+(.+)$/m);
	if (heading) return heading[1].trim();
	return null;
}

// 새 형식으로 문서 조립 (frontmatter에 title 제거, public만 유지)
function buildNewContent(isPublic, body) {
	const fm = stringifyYaml({ public: isPublic }).trimEnd();
	return `---\n${fm}\n---\n${body}`;
}

// 업로드 파일 프리픽스 인코딩 (store.ts와 동일)
function encodeSlugPrefix(slug) {
	return slug.replace(/[/@]/g, "_");
}
function decodeSlugPrefix(filename) {
	const idx = filename.indexOf("@@");
	if (idx < 0) return "";
	return filename.slice(0, idx);
}

// 디렉토리 내 모든 .md 파일 재귀 탐색
async function walkMdFiles(dir, base = "") {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		const relPath = base ? `${base}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			files.push(...await walkMdFiles(fullPath, relPath));
		} else if (entry.isFile() && /\.md$/i.test(entry.name)) {
			files.push({ fullPath, relPath, name: entry.name });
		}
	}
	return files;
}

async function migrate() {
	const files = await walkMdFiles(pagesDir);
	const renames = []; // { oldSlug, newSlug, oldPath, newPath }

	for (const file of files) {
		const slug = file.relPath.replace(/\.md$/i, "");
		const content = await fs.readFile(file.fullPath, "utf-8");
		const doc = parseDocument(content);
		const oldTitle = extractOldTitle(doc);
		const isPublic = doc.frontmatter?.public ?? true;

		// title 결정: frontmatter title > 첫 # 헤딩 > slug fallback
		const title = oldTitle || slug;

		// 본문에 # 헤딩이 없으면 추가
		let body = doc.body;
		const hasHeading = /^#\s+/m.test(body);
		if (!hasHeading && title) {
			body = `# ${title}\n\n${body}`;
		}

		// 새 콘텐츠 생성 (frontmatter에서 title 제거)
		const newContent = buildNewContent(isPublic, body);

		// 새 슬러그 결정
		let newSlug;
		if (slug === "index") {
			// index 페이지는 특수 케이스: 슬러그 유지
			newSlug = "index";
		} else {
			// path + 변환된 타이틀
			const dir = path.posix.dirname(slug);
			const dirPart = dir === "." ? "" : dir;
			const slugifiedTitle = slugifyTitle(title);
			newSlug = dirPart ? `${dirPart}/${slugifiedTitle}` : slugifiedTitle;
		}

		// 슬러그가 변경되지 않고 내용도 동일하면 건너뛰기
		if (slug === newSlug && content === newContent) {
			console.log(`SKIP (no change): ${slug}`);
			continue;
		}

		renames.push({
			oldSlug: slug,
			newSlug,
			oldPath: file.fullPath,
			newPath: path.join(pagesDir, `${newSlug}.md`),
			newContent,
			title,
		});
	}

	// 충돌 확인 (같은 newSlug에 두 파일)
	const slugMap = new Map();
	for (const r of renames) {
		if (slugMap.has(r.newSlug)) {
			console.error(`CONFLICT: ${r.oldSlug} and ${slugMap.get(r.newSlug)} both map to ${r.newSlug}`);
			process.exit(1);
		}
		slugMap.set(r.newSlug, r.oldSlug);
	}

	// 마이그레이션 실행
	console.log("\n--- Migration Plan ---");
	for (const r of renames) {
		console.log(`  ${r.oldSlug} → ${r.newSlug} (title: "${r.title}")`);
	}
	console.log("");

	if (dryRun) {
		console.log("Dry run mode — no files will be modified.");
		console.log("Remove --dry-run to apply changes.");
		return;
	}

	// 1. 모든 기존 파일을 임시 이름으로 이동 (충돌 방지)
	const tempRenames = new Map();
	for (const r of renames) {
		const tempPath = r.oldPath + ".migrating";
		try {
			await fs.rename(r.oldPath, tempPath);
			tempRenames.set(r.oldPath, tempPath);
		} catch {
			// 파일이 이미 없으면 스킵
		}
	}

	// 2. 임시 파일에서 새 위치로 작성
	for (const r of renames) {
		const sourcePath = tempRenames.get(r.oldPath) || r.oldPath;
		await fs.mkdir(path.dirname(r.newPath), { recursive: true });
		await fs.writeFile(r.newPath, r.newContent, "utf-8");
		console.log(`WRITE: ${r.newPath}`);
	}

	// 3. 임시 파일 삭제
	for (const [, tempPath] of tempRenames) {
		try {
			await fs.unlink(tempPath);
		} catch {
			// 이미 없으면 무시
		}
	}

	// 4. 빈 디렉토리 정리
	const checkedDirs = new Set();
	for (const r of renames) {
		if (r.oldSlug === r.newSlug) continue;
		const oldDir = path.dirname(r.oldPath);
		if (checkedDirs.has(oldDir)) continue;
		checkedDirs.add(oldDir);
		try {
			const entries = await fs.readdir(oldDir);
			if (entries.length === 0) {
				await fs.rmdir(oldDir);
				console.log(`RMDIR: ${oldDir}`);
			}
		} catch {
			// 디렉토리가 없으면 무시
		}
	}

	// 4. 업로드 파일 프리픽스 변경
	for (const r of renames) {
		if (r.oldSlug === r.newSlug) continue;
		const oldPrefix = encodeSlugPrefix(r.oldSlug);
		const newPrefix = encodeSlugPrefix(r.newSlug);

		let entries;
		try {
			entries = await fs.readdir(uploadsDir);
		} catch {
			continue;
		}

		for (const name of entries) {
			const decoded = decodeSlugPrefix(name);
			if (encodeSlugPrefix(decoded) !== oldPrefix) continue;
			const sepIdx = name.indexOf("@@");
			const suffix = sepIdx >= 0 ? name.slice(sepIdx) : "";
			const newName = `${newPrefix}${suffix}`;
			try {
				await fs.rename(path.join(uploadsDir, name), path.join(uploadsDir, newName));
				console.log(`UPLOAD RENAME: ${name} → ${newName}`);
			} catch {
				// 스킵
			}
		}
	}

	// 5. 새 파일 내에서 업로드 링크 갱신
	for (const r of renames) {
		if (r.oldSlug === r.newSlug) continue;
		const oldPrefix = encodeSlugPrefix(r.oldSlug);
		const newPrefix = encodeSlugPrefix(r.newSlug);

		let newContent = r.newContent;
		// /uploads/<oldPrefix>@@<file> → /uploads/<newPrefix>@@<file>
		newContent = newContent.split(`/uploads/${oldPrefix}@@`).join(`/uploads/${newPrefix}@@`);
		if (newContent !== r.newContent) {
			await fs.writeFile(r.newPath, newContent, "utf-8");
			console.log(`UPDATE LINKS: ${r.newPath}`);
		}
	}

	// 6. redirects.json 업데이트
	const redirectsPath = path.join(dataDir, "redirects.json");
	let redirects = {};
	try {
		const data = await fs.readFile(redirectsPath, "utf-8");
		redirects = JSON.parse(data);
	} catch {
		// 파일이 없으면 빈 객체
	}

	let redirectsChanged = false;
	for (const r of renames) {
		if (r.oldSlug === r.newSlug) continue;
		// 기존 리다이렉트에서 oldSlug를 가리키는 항목을 newSlug로 변경
		for (const [from, to] of Object.entries(redirects)) {
			if (to === r.oldSlug) {
				redirects[from] = r.newSlug;
				redirectsChanged = true;
			}
		}
		// oldSlug → newSlug 리다이렉트 추가
		redirects[r.oldSlug] = r.newSlug;
		redirectsChanged = true;
	}

	if (redirectsChanged) {
		await fs.writeFile(redirectsPath, JSON.stringify(redirects, null, 2), "utf-8");
		console.log(`UPDATE: ${redirectsPath}`);
	}

	console.log("\n--- Migration Complete ---");
}

migrate().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});