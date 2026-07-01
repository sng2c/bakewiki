import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "node:path";
import fs from "node:fs/promises";
import type { Store } from "./env.js";
import type { AuthUser } from "./env.js";
import { auth } from "./auth/middleware.js";
import { authRoutes } from "./auth/routes.js";
import { pageRoutes } from "./pages/routes.js";
import { uploadRoutes } from "./pages/uploads.js";
import { searchPages } from "./pages/search.js";
import { effectiveVisibility, getPageMap } from "./pages/search.js";
import { listPages } from "./pages/store.js";
import { webReadRoutes } from "./web/read.js";
import { webAuthRoutes } from "./web/auth.js";
import { webEditRoutes } from "./web/edit.js";
import { webSettingsRoutes } from "./web/settings.js";
import { publicDir, pagesDir } from "./data.js";

// 예약 파일명 — 이 파일들은 첨부 파일 서빙에서 제외
const RESERVED_FILES = new Set(["index.md", "meta.yml"]);

export function createApp(store: Store): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// store + 선택적 인증 미들웨어
	app.use("*", async (c, next) => {
		c.set("store", store);
		await next();
	});
	app.use("*", auth);

	// 캐시 제어: 동적 데이터(HTML/API)만 no-cache, 정적 자산은 캐시 허용
	app.use("/pages/*", async (c, next) => { await next(); c.header("Cache-Control", "no-cache, no-store, must-revalidate"); });
	app.use("/api/*", async (c, next) => { await next(); c.header("Cache-Control", "no-cache, no-store, must-revalidate"); });
	app.get("/", async (c, next) => { await next(); c.header("Cache-Control", "no-cache, no-store, must-revalidate"); });

	// 헬스체크
	app.get("/api/health", (c) => c.json({ ok: true }));

	// 인증 API
	app.route("/auth", authRoutes());

	// 문서 API
	app.route("/api/pages", pageRoutes());

	// 업로드 API
	app.route("/api/upload", uploadRoutes());

	// 첨부 파일 서빙: /pages/{slug}/{filename} 형식의 요청에서
	// 확장자가 있는 마지막 세그먼트면 파일 서빙 시도, 아니면 next()
	// 비공개/상속 비공개 페이지의 파일은 인증 필요.
	app.use("/pages/*", async (c, next) => {
		const reqPath = c.req.path.slice("/pages/".length);
		const lastSegment = reqPath.split("/").pop() || "";
		// 확장자가 있는 요청만 파일 서빙 시도
		if (lastSegment.includes(".")) {
			// slug 추출: /pages/tech/web/HTTPS/photo.jpg → tech/web/HTTPS
			const slug = reqPath.includes("/") ? reqPath.substring(0, reqPath.lastIndexOf("/")) : "";
			if (slug) {
				const pageMap = getPageMap();
				const pageEntry = pageMap.get(slug);
				if (pageEntry) {
					const vis = effectiveVisibility(slug, pageEntry.isPublic, pageMap);
					if (vis !== "public") {
						const user = c.get("user");
						if (!user) {
							return c.json({ error: "Not found" }, 404);
						}
					}
				}
				// slug가 인덱스에 없으면(빈 폴더 등) 파일 접근 허용
			}

			const filePath = path.join(pagesDir(store.dataDir), reqPath);
			try {
				const stat = await fs.stat(filePath);
				if (stat.isFile() && !RESERVED_FILES.has(path.basename(filePath))) {
					const data = await fs.readFile(filePath);
					// Content-Type 추측
					const ext = path.extname(filePath).toLowerCase();
					const contentTypes: Record<string, string> = {
						".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
						".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
						".pdf": "application/pdf", ".txt": "text/plain",
					};
					const contentType = contentTypes[ext] || "application/octet-stream";
					return c.body(data, 200, { "Content-Type": contentType, "Content-Length": String(data.length) });
				}
			} catch {
				// 파일 없음 — next
			}
		}
		await next();
	});

	// 임시 업로드 버킷 서빙: /uploads/_/ (새 페이지 생성 전 임시 파일)
	app.use("/uploads/*", serveStatic({ root: store.dataDir }));

	// 정적 JS 자산 서빙 (/static/*).
	// 개발 모드: Vite 미들웨어가 serve.ts에서 처리
	// 프로덕션 모드: serveStatic
	app.use("/static/*", serveStatic({ root: publicDir(), rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));

	// 검색 API (SPEC: /api/search)
	app.get("/api/search", async (c) => {
		const q = c.req.query("q");
		if (!q) return c.json({ results: [] });
		const user = c.get("user");
		const results = searchPages(q, !!user);
		return c.json({ results });
	});

	// sitemap API — 모든 페이지로 트리 빌드 후, 비인증 시 private/protected 가지치기.
	app.get("/api/sitemap", async (c) => {
		const user = c.get("user");
		const store = c.get("store");
		const allPages = await listPages(store, true);
		let tree = buildSitemapTree(allPages);
		if (!user) {
			tree = pruneSitemapPrivate(tree);
		}
		return c.json({ tree });
	});

	// 웹 UI (HTML SSR)
	app.route("/", webAuthRoutes());
	app.route("/", webEditRoutes());
	app.route("/", webReadRoutes());
	app.route("/", webSettingsRoutes());

	return app;
}

// 페이지 목록 → 계층 트리 구조.
interface SitemapNode {
	path: string;
	name: string;
	slug?: string;
	title?: string;
	public?: boolean;
	children: SitemapNode[];
}

function buildSitemapTree(pages: Array<{ slug: string; title: string; isPublic: boolean }>): SitemapNode[] {
	const root: SitemapNode[] = [];
	const nodeMap = new Map<string, SitemapNode>();

	for (const page of pages) {
		const parts = page.slug.split("/");
		let nodes = root;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;
			const nodePath = i === 0 ? "" : parts.slice(0, i).join("/");
			const nodeKey = nodePath ? `${nodePath}/${part}` : part;
			let node = nodeMap.get(nodeKey);
			if (!node) {
				node = { path: nodePath, name: part, children: [] };
				nodeMap.set(nodeKey, node);
				nodes.push(node);
			}
			if (isLast) {
				node.slug = page.slug;
				node.title = page.title;
				node.public = page.isPublic;
			}
			nodes = node.children;
		}
	}
	return root;
}

// 비인증 사용자를 위해 private 노드와 그 하위를 가지치기.
function pruneSitemapPrivate(nodes: SitemapNode[]): SitemapNode[] {
	return nodes
		.filter((n) => {
			// slug가 있으면 실제 페이지 — private이면 숨김
			if (n.slug && !n.public) return false;
			return true;
		})
		.map((n) => {
			const children = pruneSitemapPrivate(n.children);
			// 빈 중간 노드(페이지가 아니고 자식 없음)도 숨김
			if (!n.slug && children.length === 0) return null;
			return { ...n, children };
		})
		.filter((n): n is SitemapNode => n !== null);
}