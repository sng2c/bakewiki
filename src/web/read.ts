import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { getPage, listPages } from "../pages/store.js";
import { searchPages } from "../pages/search.js";
import { parseDocument, extractTitle } from "../pages/frontmatter.js";
import { renderTemplate } from "../render/hbs.js";

type FlatItem = {
	isDir: boolean;
	name: string;
	slug?: string;
	title?: string;
	isPublic?: boolean;
	depth: number;
	dirPath?: string; // 디렉토리 전체 경로 (클릭용)
};

// 페이지 목록을 디렉토리 트리로 그룹화하여 평탄화.
// 디렉토리 노드와 페이지 노드가 depth 정보와 함께 반환됨.
function buildPageTree(pages: Array<{ slug: string; title: string; isPublic: boolean }>): FlatItem[] {
	type TreeNode = {
		name: string;
		slug?: string;
		title?: string;
		isPublic?: boolean;
		isPage: boolean;
		children: Map<string, TreeNode>;
	};

	const root: TreeNode = { name: "", isPage: false, children: new Map() };

	// 페이지를 트리에 삽입
	for (const page of pages) {
		const segments = page.slug.split("/");
		let node = root;
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			const isLast = i === segments.length - 1;
			if (!node.children.has(seg)) {
				node.children.set(seg, {
					name: seg,
					isPage: false,
					children: new Map(),
				});
			}
			const child = node.children.get(seg)!;
			if (isLast) {
				child.isPage = true;
				child.slug = page.slug;
				child.title = page.title;
				child.isPublic = page.isPublic;
			}
			node = child;
		}
	}

	// 트리를 평탄화 (디렉토리 먼저, 그 다음 페이지)
	const items: FlatItem[] = [];
	function flatten(n: TreeNode, depth: number, prefix: string) {
		const dirs: TreeNode[] = [];
		const pages: TreeNode[] = [];
		for (const child of n.children.values()) {
			if (child.isPage && child.children.size > 0) {
				// 페이지이면서 자식이 있는 경우: 디렉토리로도 표시
				dirs.push(child);
			} else if (child.children.size > 0) {
				dirs.push(child);
			} else {
				pages.push(child);
			}
		}
		// 디렉토리를 이름순으로 정렬
		dirs.sort((a, b) => a.name.localeCompare(b.name));
		pages.sort((a, b) => a.name.localeCompare(b.name));
		// 디렉토리 먼저 출력
		for (const d of dirs) {
			const dirPath = prefix ? prefix + "/" + d.name : d.name;
			if (d.isPage) {
				// 페이지이면서 디렉토리인 경우: 페이지로 표시 + 자식은 하위에
				items.push({ isDir: false, name: d.name, slug: d.slug, title: d.title, isPublic: d.isPublic, depth });
				flatten(d, depth + 1, dirPath);
			} else {
				items.push({ isDir: true, name: d.name, depth, dirPath });
				flatten(d, depth + 1, dirPath);
			}
		}
		// 그 다음 일반 페이지
		for (const p of pages) {
			items.push({ isDir: false, name: p.name, slug: p.slug, title: p.title, isPublic: p.isPublic, depth });
		}
	}
	flatten(root, 0, "");
	return items;
}

// 슬러그에서 breadcrumb 항목 생성.
// 마지막 세그먼트는 title로 표시, 나머지는 slug 세그먼트.
// tech/web/HTTP + title="HTTP" → [🏠, tech, web, HTTP(current)]
// index 세그먼트는 🏠 아이콘으로 표시.
function buildBreadcrumb(slug: string, title: string) {
	const segments = slug.split("/");
	const items: Array<{ name: string; href?: string; current?: boolean }> = [];
	let acc = "";
	for (let i = 0; i < segments.length; i++) {
		acc = acc ? `${acc}/${segments[i]}` : segments[i];
		const isLast = i === segments.length - 1;
		const display = isLast ? (title || segments[i]) : segments[i];
		if (isLast) {
			items.push({ name: display, current: true });
		} else {
			items.push({ name: display, href: `/pages/${acc}` });
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

	// 전체 목록 (/pages) — 디렉토리별 그룹 트리
	app.get("/pages", async (c) => {
		const user = c.get("user");
		const store = c.get("store");
		const pages = await listPages(store, !!user);
		const items = buildPageTree(pages);
		const html = renderTemplate("list", { items }, { title: "All pages", user: !!user, q: "" });
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

		const html = await renderPage(store, slug, !!user);
		if (html) return c.html(html);
		return c.html(renderTemplate("notFound", { slug, canCreate: !!user }, { title: "Not found", user: !!user, q: "" }), 404);
	});

	return app;
}