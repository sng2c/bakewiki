import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { getPage, listPages } from "../pages/store.js";
import { searchPages } from "../pages/search.js";
import { parseDocument, extractTitle } from "../pages/frontmatter.js";
import { renderTemplate } from "../render/hbs.js";

type TreeNode = {
	name: string;
	slug?: string;
	title?: string;
	isPublic?: boolean;
	isPage: boolean;       // 실제 index.md 존재 여부
	isEmpty: boolean;      // index.md 없는 폴더 (빈 페이지)
	isDir: boolean;
	dirPath?: string;
	children: TreeNode[];
};

type FlatItem = TreeNode;

function buildPageTree(pages: Array<{ slug: string; title: string; isPublic: boolean }>): TreeNode[] {
	type RawNode = {
		name: string;
		slug?: string;
		title?: string;
		isPublic?: boolean;
		isPage: boolean;
		children: Map<string, RawNode>;
	};

	const root: RawNode = { name: "", isPage: false, children: new Map() };

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

	// RawNode(재귀 Map)를 정렬된 트리 배열(TreeNode)로 변환.
	// 디렉토리(자식 있음) 먼저, 그 다음 페이지(자식 없음).
	function toTree(n: RawNode, dirPath: string): TreeNode {
		const dirs: RawNode[] = [];
		const leaves: RawNode[] = [];
		for (const child of n.children.values()) {
			if (child.children.size > 0) dirs.push(child);
			else leaves.push(child);
		}
		dirs.sort((a, b) => a.name.localeCompare(b.name));
		leaves.sort((a, b) => a.name.localeCompare(b.name));
		const sorted = dirs.concat(leaves);
		return {
			name: n.name,
			slug: n.slug,
			title: n.title,
			isPublic: n.isPage ? n.isPublic : undefined,  // 빈 폴더는 public/private 구분 없음
			isPage: n.isPage,
			isEmpty: !n.isPage,                           // index.md 없으면 빈 페이지
			isDir: n.children.size > 0 && !n.isPage,
			dirPath: dirPath || undefined,
			children: sorted.map((c) => {
				const childPath = dirPath ? dirPath + "/" + c.name : c.name;
				return toTree(c, childPath);
			}),
		};
	}

	return toTree(root, "").children;
}

// 슬러그에서 breadcrumb 항목 생성.
function buildBreadcrumb(slug: string, title: string) {
	const segments = slug.split("/");
	const items: Array<{ name: string; href?: string; current?: boolean }> = [];
	// 홈 표시
	items.push({ name: "Home", href: "/" });
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
	const title = page.title;
	const breadcrumb = buildBreadcrumb(slug, title);
	const view = {
		page: { ...page, updatedAt: page.updatedAt.slice(0, 10) },
		breadcrumb,
		body: `# ${title}\n\n${doc.body}`,
		title,
		slug,
		user: authed,
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

	// 전체 목록 (/pages)
	app.get("/pages", async (c) => {
		const user = c.get("user");
		const store = c.get("store");
		const pages = await listPages(store, !!user);
		// index(홈)를 트리 최상단에, 나머지는 하위 트리로.
		const indexPage = pages.find((p) => p.slug === "index");
		const others = pages.filter((p) => p.slug !== "index");
		const childTree = buildPageTree(others);
		const items: TreeNode[] = [{
			name: indexPage?.title || "Home",
			slug: indexPage?.slug,
			title: indexPage?.title,
			isPublic: indexPage?.isPublic ?? true,
			isPage: true,
			isEmpty: false,
			isDir: false,
			dirPath: undefined,
			children: childTree,
		}];
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

	// 문서 조회 (/pages/:slug{.+})
	app.get("/pages/:slug{.+}", async (c) => {
		const slug = c.req.param("slug")!;
		const user = c.get("user");
		const store = c.get("store");

		const html = await renderPage(store, slug, !!user);
		if (html) return c.html(html);
		// 없는 페이지: slug의 마지막 세그먼트를 제목으로. 404가 아닌 200 + 빈 페이지 템플릿.
		const segs = slug.split("/");
		const title = segs[segs.length - 1];
		return c.html(renderTemplate("notFound", { slug, title, canCreate: !!user }, { title: `${title} - bakewiki`, user: !!user, q: "", needsPageRender: false }));
	});

	return app;
}