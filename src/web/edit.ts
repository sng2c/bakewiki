import { Hono } from "hono";
import type { DB } from "../db/index.js";
import type { AppEnv } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { getPage, createPage, updatePage, deletePage } from "../pages/store.js";
import { renderTemplate } from "../render/hbs.js";

export function webEditRoutes(db: DB): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	// /edit 와 /edit/ → 새 문서
	app.get("/edit", requireAuth, (c) => {
		return c.html(renderTemplate("editor", { page: null, slug: "" }, { title: "New page", user: true, q: "" }));
	});

	// /edit/:slug{.+} → 기존 문서 편집
	app.get("/edit/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug")!;
		const page = await getPage(db, slug);
		if (!page) {
			return c.html(renderTemplate("editor", { page: null, slug }, { title: "New page", user: true, q: "" }));
		}
		return c.html(renderTemplate("editor", { page }, { title: `Edit: ${page.title}`, user: true, q: "" }));
	});

	// 저장 (POST /edit/:slug?). slug가 폼 필드로 옴 (기존 문서면 readonly).
	app.post("/edit", requireAuth, async (c) => {
		const form = await c.req.formData();
		const slug = String(form.get("slug") ?? "").trim();
		const content = String(form.get("content") ?? "");
		if (!slug) return c.redirect("/edit");
		const existing = await getPage(db, slug);
		existing ? await updatePage(db, slug, content) : await createPage(db, slug, content);
		return c.redirect(`/page/${slug}`);
	});

	// 삭제 (POST /delete/:slug)
	app.post("/delete/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug")!;
		await deletePage(db, slug);
		return c.redirect("/");
	});

	return app;
}
