import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { getPage, createPage, updatePage, deletePage, generateSlug, slugifyTitle, migrateUploads, rewriteUploadLinks } from "../pages/store.js";
import { parseDocument, ensureHeading } from "../pages/frontmatter.js";
import { renderTemplate } from "../render/hbs.js";

export function webEditRoutes(): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// /edit 와 /edit/ → 새 문서
	app.get("/edit", requireAuth, (c) => {
		return c.html(renderTemplate("editor", {
			page: null, slug: "", title: "", public: true, body: "",
		}, { title: "New page", user: true, q: "", needsRender: true }));
	});

	// /edit/:slug{.+} → 기존 문서 편집
	app.get("/edit/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug")!;
		const store = c.get("store");
		const page = await getPage(store, slug);
		if (!page) {
			return c.html(renderTemplate("editor", {
				page: null, slug, title: "", public: true, body: "",
			}, { title: "New page", user: true, q: "", needsRender: true }));
		}
		const doc = parseDocument(page.content);
		return c.html(renderTemplate("editor", {
			page, slug,
			title: page.title,
			public: page.isPublic,
			body: doc.body,
		}, { title: `Edit: ${page.title}`, user: true, q: "", needsRender: true }));
	});

	// 저장 (POST /edit).
	app.post("/edit", requireAuth, async (c) => {
		const form = await c.req.formData();
		const originalSlug = String(form.get("originalSlug") ?? "").trim();
		const isPublic = form.get("public") === "on";
		const title = String(form.get("title") ?? "").trim();
		let body = String(form.get("content") ?? "");

		// 타이틀이 있으면 본문에 # 헤딩 추가 (헤딩이 없을 때만)
		if (title) {
			body = ensureHeading(body, title);
		}

		const store = c.get("store");

		if (originalSlug) {
			// 기존 문서 편집 — slug 변경 없이 내용/타이틀/public 업데이트
			await updatePage(store, originalSlug, body, { isPublic, title: title || undefined });
		} else {
			// 새 문서 — 타이틀에서 슬러그 유도, 없으면 nanoid
			let slug: string;
			if (title) {
				const slugified = slugifyTitle(title);
				slug = slugified || generateSlug();
			} else {
				slug = generateSlug();
			}
			// 슬러그 충돌 시 nanoid로 대체
			const existing = await getPage(store, slug);
			if (existing && title) {
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

	// 삭제 (POST /delete/:slug)
	app.post("/delete/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug")!;
		const store = c.get("store");
		await deletePage(store, slug);
		return c.redirect("/");
	});

	return app;
}