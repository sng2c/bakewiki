import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import type { Store } from "../env.js";
import { pagesDir, uploadsDir } from "../data.js";
import { slugToUploadDir, dirToSlug } from "../uploads/routes.js";
import { parseDocument, extractTitle, extractPublic, ensureHeading, type ParsedDocument } from "./frontmatter.js";
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

// 타이틀에서 슬러그 유도: 공백→하이픈, /→하이픈, 앞뒤 공백/하이픈 제거
export function deriveSlugFromTitle(title: string): string {
	return title
		.replace(/\//g, "-")
		.replace(/\s+/g, "-")
		.replace(/#+/g, "")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export async function createPage(store: Store, slug: string, content: string): Promise<Page> {
	const resolvedSlug = slug || generateSlug();
	const filePath = slugToPath(store.dataDir, resolvedSlug);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf-8");
	const doc = parseDocument(content);
	const title = extractTitle(doc) ?? resolvedSlug;
	const isPublic = extractPublic(doc);
	const stat = await fs.stat(filePath);
	const updatedAt = stat.mtime.toISOString();
	upsertSearchIndex(resolvedSlug, extractTitle(doc) ?? "", doc.body, isPublic, updatedAt);

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
	upsertSearchIndex(slug, extractTitle(doc) ?? "", doc.body, isPublic, updatedAt);
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
	upsertSearchIndex(newSlug, extractTitle(doc) ?? "", doc.body, isPublic, updatedAt);

	// 업로드 파일 동기화: oldSlug 프리픽스 파일들 rename + 본문 링크 갱신
	const migrated = await migrateUploads(store.dataDir, oldSlug, newSlug);
	let finalContent = content;
	if (migrated.length > 0) {
		finalContent = rewriteUploadLinks(content, migrated);
		await fs.writeFile(newPath, finalContent, "utf-8");
		upsertSearchIndex(newSlug, extractTitle(doc) ?? "", parseDocument(finalContent).body, isPublic, updatedAt);
	}

	return { slug: newSlug, title, content: finalContent, isPublic, updatedAt };
}

// ── 업로드 마이그레이션 (rename 시) ──
// uploads/<oldSlug>/ 디렉토리를 uploads/<newSlug>/로 rename. 반환: [{oldUrl, newUrl}]
// oldSlug가 빈 경우 (새 문서 저장) uploads/_/ 내 파일들을 uploads/<newSlug>/로 이동.
export async function migrateUploads(
	dataDir: string,
	oldSlug: string,
	newSlug: string,
): Promise<Array<{ oldUrl: string; newUrl: string }>> {
	const uploadsRoot = uploadsDir(dataDir);
	const oldDir = slugToUploadDir(oldSlug);
	const newDir = slugToUploadDir(newSlug);
	const oldPath = path.join(uploadsRoot, oldDir);
	const newPath = path.join(uploadsRoot, newDir);

	// oldSlug가 빈 경우: uploads/_/ 에서 파일들을 개별 이동
	if (!oldSlug) {
		let entries: string[];
		try {
			entries = await fs.readdir(oldPath);
		} catch {
			return [];
		}
		await fs.mkdir(newPath, { recursive: true });
		const migrated: Array<{ oldUrl: string; newUrl: string }> = [];
		for (const name of entries) {
			try {
				await fs.rename(path.join(oldPath, name), path.join(newPath, name));
				migrated.push({ oldUrl: `/uploads/${oldDir}/${name}`, newUrl: `/uploads/${newDir}/${name}` });
			} catch {
				// skip
			}
		}
		return migrated;
	}

	// rename: 디렉토리 통째로 이동
	try {
		await fs.access(oldPath);
	} catch {
		return []; // 원본 디렉토리 없음
	}
	await fs.mkdir(path.dirname(newPath), { recursive: true });
	try {
		await fs.rename(oldPath, newPath);
	} catch {
		return []; // 대상 이미 존재 등
	}
	// 마이그레이션 맵핑은 미사용 (본문 링크는 @@ 마커로 동적 변환)
	return [];
}

// 본문 내 /uploads/<old> 링크를 /uploads/<new>로 일괄 치환. (레거시 호환, 현재 미사용)
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

	// 이 페이지에 속한 업로드 파일들 일괄 삭제
	await deleteUploadsFor(store.dataDir, slug);
}

// slug 디렉토리의 업로드 파일들을 모두 삭제 (고아 방지).
async function deleteUploadsFor(dataDir: string, slug: string): Promise<void> {
	const uploadsRoot = uploadsDir(dataDir);
	const slugDir = slugToUploadDir(slug);
	const dir = path.join(uploadsRoot, slugDir);
	try {
		const entries = await fs.readdir(dir);
		for (const name of entries) {
			await fs.unlink(path.join(dir, name)).catch(() => {});
		}
		// 빈 디렉토리 삭제
		await fs.rmdir(dir).catch(() => {});
	} catch {
		// 디렉토리가 없으면 무시
	}
}