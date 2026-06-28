import { Hono } from "hono";
import type { DB } from "../db/index.js";
import type { AppEnv } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { createPage, updatePage, getPage, deletePage, listPages } from "./store.js";

// slug 검증: 빈 문자열, "..", 선행/후행 "/" 금지
function validSlug(slug: string | undefined): slug is string {
	if (!slug || slug.startsWith("/") || slug.endsWith("/")) return false;
	if (slug.includes("..")) return false;
	return true;
}

export function pageRoutes(db: DB): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	// 목록. 미인증: public만 / 인증: 전체.
	app.get("/", async (c) => {
		const user = c.get("user");
		const list = await listPages(db, !!user);
		return c.json({ pages: list });
	});

	// 단일 문서. 비공개 문서는 미인증 → 404 (존재 은닉). slug는 슬래시 포함 경로.
	app.get("/:slug{.+}", async (c) => {
		const slug = c.req.param("slug");
		if (!validSlug(slug)) {
			return c.json({ error: "Invalid slug" }, 400);
		}
		const page = await getPage(db, slug);
		if (!page) return c.json({ error: "Not found" }, 404);
		const user = c.get("user");
		if (!page.isPublic && !user) {
			return c.json({ error: "Not found" }, 404);
		}
		return c.json({ page });
	});

	// 생성 또는 수정 (upsert). 관리자 전용.
	app.post("/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug");
		if (!validSlug(slug)) {
			return c.json({ error: "Invalid slug" }, 400);
		}

		const body = await c.req.json().catch(() => null);
		const content = body?.content;
		if (typeof content !== "string") {
			return c.json({ error: "content (string) is required" }, 400);
		}

		const existing = await getPage(db, slug);
		const saved = existing
			? await updatePage(db, slug, content)
			: await createPage(db, slug, content);

		return c.json({
			slug: saved!.slug,
			title: saved!.title,
			public: saved!.isPublic,
			updatedAt: saved!.updatedAt,
		});
	});

	// 삭제. 관리자 전용.
	app.delete("/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug");
		if (!validSlug(slug)) {
			return c.json({ error: "Invalid slug" }, 400);
		}
		const existing = await getPage(db, slug);
		if (!existing) return c.json({ error: "Not found" }, 404);
		await deletePage(db, slug);
		return c.json({ ok: true });
	});

	return app;
}
