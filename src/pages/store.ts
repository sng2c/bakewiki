import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import type { Store } from "../env.js";
import { pagesDir, pageDir, indexPath, metaPath } from "../data.js";
import { parseDocument, readMeta, writeMeta } from "./frontmatter.js";
import { upsertSearchIndex, removeFromSearchIndex, renameSearchIndexPrefix } from "./search.js";

// ── 타입 ──
export type Page = {
	slug: string;
	title: string;
	content: string;
	isPublic: boolean;
	updatedAt: string;
};

export type PageSummary = Pick<Page, "slug" | "title" | "updatedAt" | "isPublic">;

// ── 랜덤 슬러그 생성 (nanoid 스타일, 8자) ──
const SLUG_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SLUG_LEN = 8;

export function generateSlug(): string {
	const bytes = crypto.randomBytes(SLUG_LEN);
	let id = "";
	for (let i = 0; i < SLUG_LEN; i++) {
		id += SLUG_CHARS[bytes[i] % SLUG_CHARS.length];
	}
	return id;
}

// ── slug에서 타이틀 추출 (디렉토리명, 폴백용) ──
export function slugToTitle(slug: string): string {
	const idx = slug.lastIndexOf("/");
	return idx < 0 ? slug : slug.slice(idx + 1);
}

// 타이틀에서 슬러그 세그먼트 유도: 공백→하이픈, /→하이픈, 앞뒤 공백/하이픈 제거
// 유니코드 지원 (한글 등 그대로 유지).
export function slugifyTitle(title: string): string {
	return title
		.replace(/\//g, "-")
		.replace(/\s+/g, "-")
		.replace(/#+/g, "")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

// ── CRUD ──
export async function getPage(store: Store, slug: string): Promise<Page | null> {
	const contentPath = indexPath(store.dataDir, slug);
	try {
		const content = await fs.readFile(contentPath, "utf-8");
		const meta = await readMeta(metaPath(store.dataDir, slug));
		const doc = parseDocument(content);
		// title: 항상 slug 마지막 세그먼트 (meta.yml title / 본문 헤딩 사용 안 함)
		const title = slugToTitle(slug);
		return { slug, title, content, isPublic: meta.public, updatedAt: meta.updatedAt };
	} catch {
		return null;
	}
}

export async function listPages(store: Store, includePrivate = false): Promise<PageSummary[]> {
	// 검색 인덱스에서 목록 조회 (인메모리, 디스크 I/O 없음)
	const { listPagesFromIndex } = await import("./search.js");
	return listPagesFromIndex(includePrivate);
}

export async function createPage(store: Store, slug: string, content: string, options?: { isPublic?: boolean }): Promise<Page> {
	const resolvedSlug = slug || generateSlug();
	const dir = pageDir(store.dataDir, resolvedSlug);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(indexPath(store.dataDir, resolvedSlug), content, "utf-8");
	const now = new Date().toISOString();
	const doc = parseDocument(content);
	const title = slugToTitle(resolvedSlug);
	const isPublic = options?.isPublic ?? true;
	await writeMeta(metaPath(store.dataDir, resolvedSlug), { public: isPublic, updatedAt: now });
	upsertSearchIndex(resolvedSlug, title, doc.body, isPublic, now);

	return { slug: resolvedSlug, title, content, isPublic, updatedAt: now };
}

export async function updatePage(store: Store, slug: string, content: string, options?: { isPublic?: boolean }): Promise<Page | null> {
	const contentPath = indexPath(store.dataDir, slug);
	try {
		await fs.access(contentPath);
	} catch {
		return null;
	}
	const meta = await readMeta(metaPath(store.dataDir, slug));
	await fs.writeFile(contentPath, content, "utf-8");
	const now = new Date().toISOString();
	const isPublic = options?.isPublic !== undefined ? options.isPublic : meta.public;
	const doc = parseDocument(content);
	const title = slugToTitle(slug);
	await writeMeta(metaPath(store.dataDir, slug), { public: isPublic, updatedAt: now });
	upsertSearchIndex(slug, title, doc.body, isPublic, now);
	return { slug, title, content, isPublic, updatedAt: now };
}

// ── 이름 변경 (디렉토리 rename) ──
export async function renamePage(store: Store, oldSlug: string, newSlug: string): Promise<Page | null> {
	const oldDir = pageDir(store.dataDir, oldSlug);
	const newDir = pageDir(store.dataDir, newSlug);

	// 원본 디렉토리가 없으면 실패
	try {
		await fs.access(oldDir);
	} catch {
		return null;
	}

	// 대상 slug가 이미 존재하면 실패
	try {
		await fs.access(newDir);
		return null; // 대상 이미 존재
	} catch {
		// 통과 — 대상 없음
	}

	// 디렉토리 rename (첨부파일도 함께 이동)
	await fs.mkdir(path.dirname(newDir), { recursive: true });
	await fs.rename(oldDir, newDir);

	// 검색 인덱스 갱신 (본인 + 하위 페이지 모두)
	renameSearchIndexPrefix(oldSlug, newSlug);

	const content = await fs.readFile(indexPath(store.dataDir, newSlug), "utf-8");
	const meta = await readMeta(metaPath(store.dataDir, newSlug));
	const doc = parseDocument(content);
	const title = slugToTitle(newSlug);

	return { slug: newSlug, title, content, isPublic: meta.public, updatedAt: meta.updatedAt };
}

// ── 업로드 마이그레이션 (임시 버킷 → 페이지 디렉토리) ──
export async function migrateUploads(
	dataDir: string,
	oldSlug: string,
	newSlug: string,
): Promise<Array<{ oldUrl: string; newUrl: string }>> {
	if (!oldSlug) {
		const tempDir = path.join(dataDir, "uploads", "_");
		const destDir = pageDir(dataDir, newSlug);
		let entries: string[];
		try {
			entries = await fs.readdir(tempDir);
		} catch {
			return [];
		}
		await fs.mkdir(destDir, { recursive: true });
		const migrated: Array<{ oldUrl: string; newUrl: string }> = [];
		for (const name of entries) {
			if (name === "index.md" || name === "meta.yml") continue;
			try {
				await fs.rename(path.join(tempDir, name), path.join(destDir, name));
				migrated.push({ oldUrl: `/uploads/_/${name}`, newUrl: `/pages/${newSlug}/${name}` });
			} catch {
				// skip
			}
		}
		return migrated;
	}
	return [];
}

// 본문 내 업로드 링크 치환.
export function rewriteUploadLinks(
	content: string,
	migrations: Array<{ oldUrl: string; newUrl: string }>,
): string {
	let result = content;
	for (const m of migrations) {
		result = result.split(m.oldUrl).join(m.newUrl);
	}
	return result;
}

export async function deletePage(store: Store, slug: string): Promise<void> {
	const dir = pageDir(store.dataDir, slug);
	try {
		await fs.rm(dir, { recursive: true });
	} catch {
		// 디렉토리가 없으면 무시
	}
	removeFromSearchIndex(slug);
}