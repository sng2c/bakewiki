import { Hono } from "hono";
import type { Store } from "./env.js";
import type { AuthUser } from "./env.js";
import { auth } from "./auth/middleware.js";
import { authRoutes } from "./auth/routes.js";
import { pageRoutes } from "./pages/routes.js";
import { searchPages } from "./pages/search.js";
import { listPages } from "./pages/store.js";
import { webReadRoutes } from "./web/read.js";
import { webAuthRoutes } from "./web/auth.js";
import { webEditRoutes } from "./web/edit.js";
import { webSettingsRoutes } from "./web/settings.js";

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
function buildSitemapTree(slugs: string[]): unknown {
	const root: Record<string, unknown> = {};
	for (const slug of slugs) {
		const parts = slug.split("/");
		let node = root;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (i === parts.length - 1) {
				node[part] = node[part] ?? slug; // 리프 = 전체 slug
			} else {
				node[part] = node[part] ?? {};
				node = node[part] as Record<string, unknown>;
			}
		}
	}
	return root;
}