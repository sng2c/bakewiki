#!/usr/bin/env node
/**
 * bakewiki 업로드 디렉토리 마이그레이션
 *
 * 기존: uploads/<slug-encoded>@@<original> (평면, @@ 구분자)
 * 신규: uploads/<slug>/<original> (디렉토리 구조)
 *
 * 콘텐츠 링크: /uploads/<slug-encoded>@@<file> → @@<file> (마커)
 *
 * 사용법: node scripts/migrate-uploads-dir.mjs [--data ./data] [--dry-run]
 */

import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const dataIdx = args.indexOf("--data");
const dataDir = path.resolve(
	dataIdx >= 0 && dataIdx + 1 < args.length ? args[dataIdx + 1] : (process.env.BAKEWIKI_DATA_DIR || "./data")
);
const dryRun = args.includes("--dry-run");

console.log(`Data directory: ${dataDir}`);
console.log(`Dry run: ${dryRun}`);
console.log("---");

const uploadsDir = path.join(dataDir, "uploads");
const pagesDir = path.join(dataDir, "pages");

// 기존: <slug-encoded>@@<original> → 신규: <slug>/<original>
// slug-encoded에서 __ → / 로 디코딩
function decodeSlug(encoded) {
	return encoded.replace(/__/g, "/");
}

async function migrateUploads() {
	let entries;
	try {
		entries = await fs.readdir(uploadsDir);
	} catch {
		console.log("No uploads directory.");
		return;
	}

	const moves = [];
	for (const name of entries) {
		const sepIdx = name.indexOf("@@");
		if (sepIdx <= 0) continue; // @@ 구분자 없으면 스킵
		const encoded = name.slice(0, sepIdx);
		const original = name.slice(sepIdx + 2);
		if (!original) continue;

		const slug = decodeSlug(encoded);
		const oldPath = path.join(uploadsDir, name);
		const newDir = path.join(uploadsDir, slug);
		const newPath = path.join(newDir, original);
		moves.push({ name, slug, original, oldPath, newPath, newDir });
	}

	console.log("\n--- Upload File Migration ---");
	for (const m of moves) {
		console.log(`  ${m.name} → ${m.slug}/${m.original}`);
	}

	if (dryRun) return;

	for (const m of moves) {
		await fs.mkdir(m.newDir, { recursive: true });
		try {
			await fs.rename(m.oldPath, m.newPath);
			console.log(`MOVED: ${m.name} → ${m.slug}/${m.original}`);
		} catch (e) {
			console.error(`FAILED: ${m.name} - ${e.message}`);
		}
	}
}

async function migrateContent() {
	// pages/ 내 모든 .md 파일 재귀 탐색
	async function walkMd(dir, base = "") {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		const files = [];
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			const relPath = base ? `${base}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				files.push(...await walkMd(fullPath, relPath));
			} else if (entry.isFile() && /\.md$/i.test(entry.name)) {
				files.push({ fullPath, relPath });
			}
		}
		return files;
	}

	const files = await walkMd(pagesDir);
	console.log("\n--- Content Link Migration ---");

	for (const file of files) {
		const content = await fs.readFile(file.fullPath, "utf-8");
		// /uploads/<slug-encoded>@@<original> → @@<original>
		const pattern = /\/uploads\/[^@\s]+@@([^\s)]+)/g;
		const newContent = content.replace(pattern, "@@$1");

		if (newContent !== content) {
			const slug = file.relPath.replace(/\.md$/i, "");
			console.log(`  ${slug}: link(s) updated`);
			if (!dryRun) {
				await fs.writeFile(file.fullPath, newContent, "utf-8");
			}
		}
	}

	if (dryRun) {
		console.log("\nDry run mode — no files modified.");
	}
}

async function main() {
	await migrateUploads();
	await migrateContent();
	console.log("\n--- Migration Complete ---");
}

main().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});