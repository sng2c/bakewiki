import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataDir, uploadsDir } from "../data.js";

// pages 디렉토리 → 외부 폴더로 복사 (덮어쓰기).
export async function exportCommand(dir: string, dataDir?: string): Promise<void> {
	const dest = path.resolve(dir);
	await fs.mkdir(dest, { recursive: true });

	const resolvedDataDir = resolveDataDir(dataDir);
	const src = path.join(resolvedDataDir, "pages");

	// pages 디렉토리가 없으면 빈 상태
	try {
		await fs.access(src);
	} catch {
		console.log("No pages to export.");
		return;
	}

	const files = await collectMarkdown(src);
	let count = 0;

	for (const file of files) {
		const rel = path.relative(src, file);
		const target = path.join(dest, rel);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.copyFile(file, target);
		count++;
	}

	console.log(`Exported ${count} file(s) to ${dest}.`);

	// uploads 디렉토리 동반 복사 (이미지 등)
	const uploadsSrc = uploadsDir(resolvedDataDir);
	try {
		await fs.access(uploadsSrc);
		await copyDir(uploadsSrc, path.join(dest, "uploads"));
		console.log("Exported uploads/");
	} catch {
		// uploads 없으면 스킵
	}
}

async function copyDir(src: string, dest: string): Promise<void> {
	await fs.mkdir(dest, { recursive: true });
	const entries = await fs.readdir(src, { withFileTypes: true });
	for (const e of entries) {
		const s = path.join(src, e.name);
		const d = path.join(dest, e.name);
		if (e.isDirectory()) await copyDir(s, d);
		else await fs.copyFile(s, d);
	}
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