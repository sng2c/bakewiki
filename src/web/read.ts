import { Hono } from "hono";
import type { DB } from "../db/index.js";
import type { AppEnv } from "../env.js";
import { getPage, listPages } from "../pages/store.js";
import { searchPages } from "../pages/search.js";
import { parseDocument } from "../pages/frontmatter.js";
import { renderMarkdown } from "../render/markdown.js";
import { renderTemplate } from "../render/hbs.js";

// 공통: 단일 페이지를 HTML로 렌더링. 없거나 권한 없으면 null.
async function renderPage(db: DB, slug: string, authed: boolean): Promise<string | null> {
	const page = await getPage(db, slug);
	if (!page) return null;
	if (!page.public && !authed) return null;
	const doc = parseDocument(page.content);
	const html = renderMarkdown(doc.body);
	const view = {
		page: { ...page, updatedAt: page.updatedAt.toISOString().slice(0, 10) },
		html,
		user: authed, // page 템플릿의 Edit 버튼 표시용
	};
	return renderTemplate("page", view, { title: page.title, user: authed, q: "" });
}

export function webReadRoutes(db: DB): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	// 홈 = /index 페이지. 없으면 새로 만들기(edit/index)로.
	app.get("/", async (c) => {
		const user = c.get("user");
		const html = await renderPage(db, "index", !!user);
		if (html) return c.html(html);
		return c.redirect("/edit/index");
	});

	// 전체 목록 (/pages)
	app.get("/pages", async (c) => {
		const user = c.get("user");
		const pages = await listPages(db, !!user);
		const html = renderTemplate("list", { pages }, { title: "All pages", user: !!user, q: "" });
		return c.html(html);
	});

	// 검색 페이지 (/search?q=)
	app.get("/search", async (c) => {
		const q = c.req.query("q") ?? "";
		const user = c.get("user");
		const results = q ? searchPages(db, q, !!user) : [];
		const html = renderTemplate("search", { q, results }, { title: "Search", user: !!user, q });
		return c.html(html);
	});

	// 문서 조회 (/page/:slug{.+}). 없으면 edit로 (위키 동작).
	app.get("/page/:slug{.+}", async (c) => {
		const slug = c.req.param("slug")!;
		const user = c.get("user");
		const html = await renderPage(db, slug, !!user);
		if (html) return c.html(html);
		return c.redirect(`/edit/${slug}`);
	});

	return app;
}
