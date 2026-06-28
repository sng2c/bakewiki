import { Hono } from "hono";
import type { DB } from "../db/index.js";
import type { AppEnv } from "../env.js";
import { getPage, listPages } from "../pages/store.js";
import { searchPages } from "../pages/search.js";
import { parseDocument } from "../pages/frontmatter.js";
import { renderMarkdown } from "../render/markdown.js";
import { renderTemplate } from "../render/hbs.js";

export function webReadRoutes(db: DB): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	// 홈 = 전체 목록
	app.get("/", async (c) => {
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

	// 문서 조회 (/page/:slug{.+})
	app.get("/page/:slug{.+}", async (c) => {
		const slug = c.req.param("slug");
		const page = await getPage(db, slug);
		const user = c.get("user");
		if (!page) {
			return c.html(renderTemplate("notFound", {}, { title: "Not found", user: !!user, q: "" }), 404);
		}
		if (!page.public && !user) {
			return c.html(renderTemplate("notFound", {}, { title: "Not found", user: !!user, q: "" }), 404);
		}
		const doc = parseDocument(page.content);
		const html = renderMarkdown(doc.body);
		const view = {
			page: { ...page, updatedAt: page.updatedAt.toISOString().slice(0, 10) },
			html,
		};
		const wrapped = renderTemplate("page", view, { title: page.title, user: !!user, q: "" });
		return c.html(wrapped);
	});

	return app;
}
