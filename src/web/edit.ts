import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { getPage, createPage, updatePage, renamePage, deletePage, generateSlug, migrateUploads, rewriteUploadLinks } from "../pages/store.js";
import { parseDocument, extractTitle, ensureHeading } from "../pages/frontmatter.js";
import { renderTemplate } from "../render/hbs.js";

export function webEditRoutes(): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// path 추출: 슬러그에서 마지막 세그먼트 제거.
	function extractPath(slug: string): string {
		const idx = slug.lastIndexOf("/");
		return idx < 0 ? "" : slug.slice(0, idx);
	}

	// 슬러그에서 마지막 세그먼트 추출
	function extractLastSegment(slug: string): string {
		const idx = slug.lastIndexOf("/");
		return idx < 0 ? slug : slug.slice(idx + 1);
	}

	// /edit 와 /edit/ → 새 문서
	app.get("/edit", requireAuth, (c) => {
		return c.html(renderTemplate("editor", {
			page: null, slug: "", path: "", public: true, body: "",
		}, { title: "New page", user: true, q: "", needsRender: true }));
	});

	// /edit/:slug{.+} → 기존 문서 편집
	app.get("/edit/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug")!;
		const store = c.get("store");
		const page = await getPage(store, slug);
		if (!page) {
			return c.html(renderTemplate("editor", {
				page: null, slug, path: extractPath(slug), public: true, body: "",
			}, { title: "New page", user: true, q: "", needsRender: true }));
		}
		const doc = parseDocument(page.content);
		return c.html(renderTemplate("editor", {
			page, slug,
			path: extractPath(slug),
			public: page.isPublic,
			body: doc.body,
		}, { title: `Edit: ${page.title}`, user: true, q: "", needsRender: true }));
	});

	// 저장 (POST /edit).
	app.post("/edit", requireAuth, async (c) => {
		const form = await c.req.formData();
		const originalSlug = String(form.get("originalSlug") ?? "").trim();
		const isPublic = form.get("public") === "on";
		let body = String(form.get("content") ?? "");

		// 본문에서 첫 # 헤딩 추출 → 타이틀
		const doc = parseDocument(body);
		const title = extractTitle(doc);

		let slug: string;
		if (originalSlug) {
			// 기존 문서 편집 — 슬러그 변경 불가 (nanoid이므로)
			slug = originalSlug;
		} else {
			// 새 문서 — nanoid로 자동 배정
			slug = generateSlug();
		}

		// 본문에 # 헤딩이 없고 타이틀을 알 수 있으면 헤딩 추가
		if (title) {
			body = ensureHeading(body, title);
		}

		const store = c.get("store");

		if (originalSlug) {
			// 기존 문서 편집
			await updatePage(store, slug, body, { isPublic });
		} else {
			// 새 문서
			await createPage(store, slug, body);
			// public은 기본값 true로 생성되므로, false면 업데이트
			if (!isPublic) {
				await updatePage(store, slug, body, { isPublic: false });
			}
			// 임시 업로드를 실제 slug로 이관 + 본문 링크 갱신
			const migrated = await migrateUploads(store.dataDir, "", slug);
			if (migrated.length > 0) {
				const updated = await getPage(store, slug);
				if (updated) {
					const newContent = rewriteUploadLinks(updated.content, migrated);
					await updatePage(store, slug, newContent);
				}
			}
		}
		return c.redirect(`/pages/${slug}`);
	});

	// 삭제 (POST /delete/:slug)
	app.post("/delete/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug")!;
		const store = c.get("store");
		await deletePage(store, slug);
		return c.redirect("/");
	});

	return app;
}