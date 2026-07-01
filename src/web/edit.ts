import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import path from "node:path";
import fs from "node:fs/promises";
import { requireAuth } from "../auth/middleware.js";
import { getPage, createPage, updatePage, deletePage, renamePage, generateSlug, slugifyTitle, migrateUploads, rewriteUploadLinks } from "../pages/store.js";
import { removeFromSearchIndex } from "../pages/search.js";
import { indexPath, metaPath } from "../data.js";
import { parseDocument } from "../pages/frontmatter.js";
import { renderTemplate } from "../render/hbs.js";

export function webEditRoutes(): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// path 추출: 슬러그에서 마지막 세그먼트 제거.
	function extractPath(slug: string): string {
		const idx = slug.lastIndexOf("/");
		return idx < 0 ? "" : slug.slice(0, idx);
	}

	// 타이틀 추출: 슬러그에서 마지막 세그먼트.
	function extractTitle(slug: string): string {
		const idx = slug.lastIndexOf("/");
		return idx < 0 ? slug : slug.slice(idx + 1);
	}

	// /edit 와 /edit/ → 새 문서. ?path= 로 부모 경로 지정 가능.
	app.get("/edit", requireAuth, (c) => {
		const path = c.req.query("path") ?? "";
		return c.html(renderTemplate("editor", {
			page: null, slug: "", title: "", path, public: true, body: "",
		}, { title: "New page", user: true, q: "", needsRender: true }));
	});

	// /edit/:slug{.+} → 기존 문서 편집
	app.get("/edit/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug")!;
		const store = c.get("store");
		const page = await getPage(store, slug);
		const isHome = slug === store.config.homeSlug;
		if (!page) {
			return c.html(renderTemplate("editor", {
				page: null, slug, title: extractTitle(slug), path: extractPath(slug), public: true, body: "", isHome,
			}, { title: "New page", user: true, q: "", needsRender: true }));
		}
		const doc = parseDocument(page.content);
		return c.html(renderTemplate("editor", {
			page, slug,
			title: page.title,
			path: extractPath(slug),
			public: page.isPublic,
			body: doc.body,
			isHome,
		}, { title: `Edit: ${page.title}`, user: true, q: "", needsRender: true }));
	});

	// 저장 (POST /edit).
	app.post("/edit", requireAuth, async (c) => {
		const form = await c.req.formData();
		const originalSlug = String(form.get("originalSlug") ?? "").trim();
		const pagePath = String(form.get("path") ?? "").trim();
		const isPublic = form.get("public") === "on";
		const title = String(form.get("title") ?? "").trim();
		const body = String(form.get("content") ?? "");

		const store = c.get("store");

		if (originalSlug) {
			// 기존 문서 편집 — 내용/타이틀/public 먼저 업데이트
			await updatePage(store, originalSlug, body, { isPublic, title: title || undefined });

			// path 변경 시 rename (하위 페이지도 함께 이동)
			const originalPath = extractPath(originalSlug);
			if (pagePath !== originalPath && originalSlug !== store.config.homeSlug) {
				const lastSegment = originalSlug.includes("/")
					? originalSlug.substring(originalSlug.lastIndexOf("/") + 1)
					: originalSlug;
				const newSlug = pagePath ? `${pagePath}/${lastSegment}` : lastSegment;
				if (newSlug !== originalSlug) {
					const result = await renamePage(store, originalSlug, newSlug);
					if (result) {
						return c.redirect(`/pages/${newSlug}`);
					}
					// rename 실패(대상 충돌 등) — 기존 slug로 리다이렉트
				}
			}

			return c.redirect(`/pages/${originalSlug}`);
		} else {
			// 새 문서 — path + 타이틀에서 슬러그 유도, 없으면 nanoid
			let slug: string;
			if (title) {
				const slugified = slugifyTitle(title);
				const segment = slugified || generateSlug();
				slug = pagePath ? `${pagePath}/${segment}` : segment;
			} else {
				slug = generateSlug();
			}
			// 슬러그 충돌 시 접미사 추가
			const existing = await getPage(store, slug);
			if (existing) {
				slug = `${slug}-${generateSlug().slice(0, 4)}`;
			}
			const existing2 = await getPage(store, slug);
			if (existing2) {
				slug = generateSlug();
			}
			await createPage(store, slug, body, { title: title || undefined, isPublic });
			// 임시 업로드를 실제 slug로 이관 + 본문 링크 갱신
			const migrated = await migrateUploads(store.dataDir, "", slug);
			if (migrated.length > 0) {
				const updated = await getPage(store, slug);
				if (updated) {
					const newContent = rewriteUploadLinks(updated.content, migrated);
					await updatePage(store, slug, newContent);
				}
			}
			return c.redirect(`/pages/${slug}`);
		}
		return c.redirect(`/pages/${originalSlug}`);
	});

	// 삭제: index.md + meta.yml 삭제, 검색 인덱스 제거 (디렉토리·첨부 유지)
	app.post("/delete/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug")!;
		const store = c.get("store");
		try { await fs.unlink(indexPath(store.dataDir, slug)); } catch {}
		try { await fs.unlink(metaPath(store.dataDir, slug)); } catch {}
		removeFromSearchIndex(slug);
		return c.redirect("/");
	});

	return app;
}