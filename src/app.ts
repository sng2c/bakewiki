import { Hono } from "hono";
import type { DB } from "./db/index.js";
import type { AppEnv } from "./env.js";
import { auth } from "./auth/middleware.js";
import { authRoutes } from "./auth/routes.js";
import { pageRoutes } from "./pages/routes.js";
import { searchPages } from "./pages/search.js";
import { ensureFts } from "./pages/search.js";
import { listPages } from "./pages/store.js";

export function createApp(db: DB): Hono<AppEnv> {
	ensureFts(db);

	const app = new Hono<AppEnv>();

	// db + 선택적 인증 미들웨어
	app.use("*", async (c, next) => {
		c.set("db", db);
		await next();
	});
	app.use("*", auth);

	// 헬스체크
	app.get("/api/health", (c) => c.json({ ok: true }));

	// 인증
	app.route("/auth", authRoutes(db));

	// 문서
	app.route("/api/pages", pageRoutes(db));

	// 검색 (SPEC: /api/search)
	app.get("/api/search", async (c) => {
		const q = c.req.query("q");
		if (!q) return c.json({ results: [] });
		const user = c.get("user");
		const results = searchPages(db, q, !!user);
		return c.json({ results });
	});

	// sitemap (TODO: 단위 2-7에서 구현)
	app.get("/api/sitemap", async (c) => {
		const user = c.get("user");
		const list = await listPages(db, !!user);
		const tree = buildSitemapTree(list.map((p) => p.slug));
		return c.json({ tree });
	});

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
