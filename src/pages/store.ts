import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import type { Store } from "../env.js";
import { pagesDir, readRedirects, writeRedirects } from "../data.js";
import { parseDocument, extractTitle, extractPublic, type ParsedDocument } from "./frontmatter.js";
import { upsertSearchIndex, removeFromSearchIndex } from "./search.js";

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

// ── slug ↔ 파일 경로 변환 ──
function slugToPath(dataDir: string, slug: string): string {
	return path.join(pagesDir(dataDir), `${slug}.md`);
}

// ── CRUD ──
export async function getPage(store: Store, slug: string): Promise<Page | null> {
	const filePath = slugToPath(store.dataDir, slug);
	try {
		const content = await fs.readFile(filePath, "utf-8");
		const stat = await fs.stat(filePath);
		const doc = parseDocument(content);
		const title = extractTitle(doc) ?? slug;
		const isPublic = extractPublic(doc);
		return { slug, title, content, isPublic, updatedAt: stat.mtime.toISOString() };
	} catch {
		return null;
	}
}

export async function listPages(store: Store, includePrivate = false): Promise<PageSummary[]> {
	// 검색 인덱스에서 목록 조회 (인메모리, 디스크 I/O 없음)
	const { listPagesFromIndex } = await import("./search.js");
	return listPagesFromIndex(includePrivate);
}

export async function createPage(store: Store, slug: string, content: string): Promise<Page> {
	const resolvedSlug = slug || generateSlug();
	const filePath = slugToPath(store.dataDir, resolvedSlug);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf-8");
	const doc = parseDocument(content);
	const title = extractTitle(doc) || resolvedSlug;
	const isPublic = extractPublic(doc);
	const stat = await fs.stat(filePath);
	const updatedAt = stat.mtime.toISOString();
	upsertSearchIndex(resolvedSlug, title, content, isPublic, updatedAt);
	return { slug: resolvedSlug, title, content, isPublic, updatedAt };
}

export async function updatePage(store: Store, slug: string, content: string): Promise<Page | null> {
	const filePath = slugToPath(store.dataDir, slug);
	try {
		await fs.access(filePath);
	} catch {
		return null;
	}
	await fs.writeFile(filePath, content, "utf-8");
	const doc = parseDocument(content);
	const title = extractTitle(doc) ?? slug;
	const isPublic = extractPublic(doc);
	const stat = await fs.stat(filePath);
	const updatedAt = stat.mtime.toISOString();
	upsertSearchIndex(slug, title, content, isPublic, updatedAt);
	return { slug, title, content, isPublic, updatedAt };
}

// ── 이름 변경 (slug 변경 + 리다이렉트 등록) ──
export async function renamePage(store: Store, oldSlug: string, newSlug: string): Promise<Page | null> {
	const oldPath = slugToPath(store.dataDir, oldSlug);
	const newPath = slugToPath(store.dataDir, newSlug);

	// 원본 페이지가 없으면 실패
	let content: string;
	try {
		content = await fs.readFile(oldPath, "utf-8");
	} catch {
		return null;
	}

	// 대상 slug가 이미 존재하면 실패
	try {
		await fs.access(newPath);
		return null; // 대상 이미 존재
	} catch {
		// 통과 — 대상 없음
	}

	// 새 경로에 쓰고 기존 파일 삭제
	await fs.mkdir(path.dirname(newPath), { recursive: true });
	await fs.writeFile(newPath, content, "utf-8");
	await fs.unlink(oldPath);

	// 빈 부모 디렉토리 정리
	const oldDir = path.dirname(oldPath);
	const pagesRoot = pagesDir(store.dataDir);
	if (oldDir !== pagesRoot) {
		const entries = await fs.readdir(oldDir).catch(() => undefined);
		if (entries !== undefined && entries.length === 0) {
			await fs.rmdir(oldDir).catch(() => {});
		}
	}

	// 검색 인덱스 갱신
	const doc = parseDocument(content);
	const title = extractTitle(doc) || newSlug;
	const isPublic = extractPublic(doc);
	const stat = await fs.stat(newPath);
	const updatedAt = stat.mtime.toISOString();
	removeFromSearchIndex(oldSlug);
	upsertSearchIndex(newSlug, title, content, isPublic, updatedAt);

	// 리다이렉트 등록 (oldSlug → newSlug)
	// 순환 방지: newSlug를 가리키는 기존 리다이렉트 제거
	const redirects = await readRedirects(store.dataDir);
	delete redirects[newSlug]; // B → A 순환 차단
	for (const key of Object.keys(redirects)) {
		if (redirects[key] === newSlug) delete redirects[key]; // X → newSlug 정리
	}
	redirects[oldSlug] = newSlug;
	await writeRedirects(store.dataDir, redirects);

	return { slug: newSlug, title, content, isPublic, updatedAt };
}

export async function deletePage(store: Store, slug: string): Promise<void> {
	const filePath = slugToPath(store.dataDir, slug);
	try {
		await fs.unlink(filePath);
		// 빈 부모 디렉토리 정리
		const dir = path.dirname(filePath);
		const pagesRoot = pagesDir(store.dataDir);
		if (dir !== pagesRoot) {
			const entries = await fs.readdir(dir).catch(() => undefined);
			if (entries !== undefined && entries.length === 0) {
				await fs.rmdir(dir).catch(() => {});
			}
		}
	} catch {
		// 파일이 없으면 무시
	}
	removeFromSearchIndex(slug);
}