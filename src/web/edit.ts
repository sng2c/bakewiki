import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { getPage, createPage, updatePage, deletePage, renamePage, generateSlug, migrateUploads, rewriteUploadLinks } from "../pages/store.js";
import { parseDocument, extractTitle, extractPublic, buildDocument } from "../pages/frontmatter.js";
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
			title: extractTitle(doc) ?? "",
			public: extractPublic(doc),
			body: doc.body,
		}, { title: `Edit: ${page.title}`, user: true, q: "", needsRender: true }));
	});

	// 저장 (POST /edit). title/public/content를 분리된 폼 필드에서 받음.
	app.post("/edit", requireAuth, async (c) => {
		const form = await c.req.formData();
		const originalSlug = String(form.get("originalSlug") ?? "").trim();
		let slug = String(form.get("slug") ?? "").trim();
		const title = String(form.get("title") ?? "").trim();
		const isPublic = form.get("public") === "on";
		const body = String(form.get("content") ?? "");
		const content = buildDocument(title, isPublic, body);
		const store = c.get("store");

		if (originalSlug) {
			// 기존 문서 편집
			if (slug && slug !== originalSlug) {
				// slug 변경 → 이름 변경 + 콘텐츠 업데이트
				const renamed = await renamePage(store, originalSlug, slug);
				if (!renamed) {
					// 대상 slug가 이미 존재하면 원래 slug로 되돌림
					slug = originalSlug;
				} else {
					slug = renamed.slug;
				}
				await updatePage(store, slug, content);
			} else if (!slug) {
				// slug를 지운 경우 → 자동 생성 + 이름 변경
				slug = generateSlug();
				await renamePage(store, originalSlug, slug);
				await updatePage(store, slug, content);
			} else {
				// slug 변경 없음 → 콘텐츠만 업데이트
				await updatePage(store, slug, content);
			}
		} else {
			// 새 문서
			if (!slug) slug = generateSlug();
			const existing = await getPage(store, slug);
			if (existing) {
				await updatePage(store, slug, content);
			} else {
				await createPage(store, slug, content);
			}
			// 임시(_) 업로드를 실제 slug로 이관 + 본문 링크 갱신
			const migrated = await migrateUploads(store.dataDir, "", slug);
			if (migrated.length > 0) {
				const page = await getPage(store, slug);
				if (page) {
					const newContent = rewriteUploadLinks(page.content, migrated);
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