import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Store } from "./env.js";
import type { AuthUser } from "./env.js";
import { auth } from "./auth/middleware.js";
import { authRoutes } from "./auth/routes.js";
import { pageRoutes } from "./pages/routes.js";
import { uploadRoutes } from "./uploads/routes.js";
import { searchPages } from "./pages/search.js";
import { listPages } from "./pages/store.js";
import { webReadRoutes } from "./web/read.js";
import { webAuthRoutes } from "./web/auth.js";
import { webEditRoutes } from "./web/edit.js";
import { webSettingsRoutes } from "./web/settings.js";
import { publicDir } from "./data.js";

export function createApp(store: Store): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// store + 선택적 인증 미들웨어
	app.use("*", async (c, next) => {
		c.set("store", store);
		await next();
	});
	app.use("*", auth);

	// 헬스체크
	app.get("/api/health", (c) => c.json({ ok: true }));

	// 인증 API
	app.route("/auth", authRoutes());

	// 문서 API
	app.route("/api/pages", pageRoutes());

	// 업로드 API
	app.route("/api/upload", uploadRoutes());

	// 업로드된 이미지 공개 서빙 (dataDir/uploads/*). 인증 불필요.
	app.use("/uploads/*", serveStatic({ root: store.dataDir }));

	// 정적 JS 자산 서빙 (/static/* → publicDir/*).
	app.use("/static/*", serveStatic({ root: publicDir(), rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));

	// 검색 API (SPEC: /api/search)
	app.get("/api/search", async (c) => {
		const q = c.req.query("q");
		if (!q) return c.json({ results: [] });
		const user = c.get("user");
		const results = searchPages(q, !!user);
		return c.json({ results });
	});

	// sitemap API
	app.get("/api/sitemap", async (c) => {
		const user = c.get("user");
		const store = c.get("store");
		const list = await listPages(store, !!user);
		const tree = buildSitemapTree(list.map((p) => p.slug));
		return c.json({ tree });
	});

	// 웹 UI (HTML SSR)
	app.route("/", webAuthRoutes());
	app.route("/", webEditRoutes());
	app.route("/", webReadRoutes());
	app.route("/", webSettingsRoutes());

	return app;
}

// slug 목록 → 계층 트리 구조
interface SitemapNode {
	slug: string;
	children: SitemapNode[];
}

function buildSitemapTree(slugs: string[]): SitemapNode[] {
	const root: SitemapNode[] = [];
	for (const slug of slugs) {
		const parts = slug.split("/");
		let nodes = root;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			let node = nodes.find((n) => n.slug === (i < parts.length - 1 ? parts.slice(0, i + 1).join("/") : slug));
			if (!node) {
				node = { slug: i < parts.length - 1 ? parts.slice(0, i + 1).join("/") : slug, children: [] };
				nodes.push(node);
			}
			nodes = node.children;
		}
	}
	return root;
}