import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { getPage, listPages } from "../pages/store.js";
import { searchPages } from "../pages/search.js";
import { readRedirects } from "../data.js";
import { parseDocument, extractTitle } from "../pages/frontmatter.js";
import { renderTemplate } from "../render/hbs.js";

// 슬러그에서 breadcrumb 항목 생성.
// 마지막 세그먼트는 title로 표시, 나머지는 slug 세그먼트.
// tech/web/HTTP + title="HTTP" → [Home, tech, web, HTTP(current)]
function buildBreadcrumb(slug: string, title: string) {
	const segments = slug.split("/");
	const items: Array<{ name: string; href?: string; current?: boolean }> = [
		{ name: "Home", href: "/" },
	];
	let acc = "";
	for (let i = 0; i < segments.length; i++) {
		acc = acc ? `${acc}/${segments[i]}` : segments[i];
		if (i === segments.length - 1) {
			items.push({ name: title || segments[i], current: true });
		} else {
			items.push({ name: segments[i], href: `/pages/${acc}` });
		}
	}
	return items;
}

// 공통: 단일 페이지를 렌더링. 없거나 권한 없으면 null.
async function renderPage(store: Store, slug: string, authed: boolean): Promise<string | null> {
	const page = await getPage(store, slug);
	if (!page) return null;
	if (!page.isPublic && !authed) return null;
	const doc = parseDocument(page.content);
	const extractedTitle = extractTitle(doc) ?? "";
	const title = extractedTitle;
	const breadcrumb = buildBreadcrumb(slug, title);
	const view = {
		page: { ...page, updatedAt: page.updatedAt.slice(0, 10) },
		breadcrumb,
		body: doc.body,
		title,
		slug,
		user: authed,
		pageData: JSON.stringify({ title, slug, body: doc.body }),
	};
	return renderTemplate("page", view, { title: title || page.slug, user: authed, q: "", needsPageRender: true });
}

// 공통: 리다이렉트 조회. 있으면 301 리다이렉트, 없으면 null.
async function checkRedirect(store: Store, slug: string): Promise<string | null> {
	const redirects = await readRedirects(store.dataDir);
	return redirects[slug] ?? null;
}

export function webReadRoutes(): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// 홈 = /index 페이지. 없으면 notFound.
	app.get("/", async (c) => {
		const user = c.get("user");
		const store = c.get("store");
		const html = await renderPage(store, "index", !!user);
		if (html) return c.html(html);
		return c.html(renderTemplate("notFound", { slug: "index", canCreate: !!user }, { title: "Not found", user: !!user, q: "" }), 404);
	});

	// 전체 목록 (/pages)
	app.get("/pages", async (c) => {
		const user = c.get("user");
		const store = c.get("store");
		const pages = await listPages(store, !!user);
		const html = renderTemplate("list", { pages }, { title: "All pages", user: !!user, q: "" });
		return c.html(html);
	});

	// 검색 페이지 (/search?q=)
	app.get("/search", async (c) => {
		const q = c.req.query("q") ?? "";
		const user = c.get("user");
		const results = q ? searchPages(q, !!user) : [];
		const html = renderTemplate("search", { q, results }, { title: "Search", user: !!user, q });
		return c.html(html);
	});

	// 문서 조회 (/pages/:slug{.+}). 리다이렉트 → 301, 없으면 notFound.
	app.get("/pages/:slug{.+}", async (c) => {
		const slug = c.req.param("slug")!;
		const user = c.get("user");
		const store = c.get("store");

		// 리다이렉트 확인
		const redirectTo = await checkRedirect(store, slug);
		if (redirectTo) return c.redirect(`/pages/${redirectTo}`, 301);

		const html = await renderPage(store, slug, !!user);
		if (html) return c.html(html);
		return c.html(renderTemplate("notFound", { slug, canCreate: !!user }, { title: "Not found", user: !!user, q: "" }), 404);
	});

	return app;
}