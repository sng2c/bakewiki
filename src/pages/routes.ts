import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { createPage, updatePage, getPage, deletePage, renamePage, listPages } from "../pages/store.js";
import { readRedirects } from "../data.js";

// slug 검증: 빈 문자열, "..", 선행/후행 "/" 금지
function validSlug(slug: string | undefined): slug is string {
	if (!slug || slug.startsWith("/") || slug.endsWith("/")) return false;
	if (slug.includes("..")) return false;
	return true;
}

export function pageRoutes(): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// 목록. 미인증: public만 / 인증: 전체.
	app.get("/", async (c) => {
		const user = c.get("user");
		const store = c.get("store");
		const list = await listPages(store, !!user);
		return c.json({ pages: list });
	});

	// 단일 문서. 리다이렉트 우선 확인, 비공개 문서는 미인증 → 404.
	app.get("/:slug{.+}", async (c) => {
		const slug = c.req.param("slug");
		if (!validSlug(slug)) {
			return c.json({ error: "Invalid slug" }, 400);
		}
		const store = c.get("store");

		// 리다이렉트 확인
		const redirects = await readRedirects(store.dataDir);
		const redirectTo = redirects[slug];
		if (redirectTo) {
			return c.json({ redirect: redirectTo }, 301);
		}

		const page = await getPage(store, slug);
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

		const store = c.get("store");
		const existing = await getPage(store, slug);
		const saved = existing
			? await updatePage(store, slug, content)
			: await createPage(store, slug, content);

		return c.json({
			slug: saved!.slug,
			title: saved!.title,
			public: saved!.isPublic,
			updatedAt: saved!.updatedAt,
		});
	});

	// 이름 변경 (PATCH). 관리자 전용.
	app.patch("/:slug{.+}", requireAuth, async (c) => {
		const oldSlug = c.req.param("slug");
		if (!validSlug(oldSlug)) {
			return c.json({ error: "Invalid slug" }, 400);
		}

		const body = await c.req.json().catch(() => null);
		const newSlug = body?.slug;
		if (typeof newSlug !== "string" || !validSlug(newSlug)) {
			return c.json({ error: "slug (string) is required" }, 400);
		}

		const store = c.get("store");
		const result = await renamePage(store, oldSlug, newSlug);
		if (!result) return c.json({ error: "Not found or target slug already exists" }, 409);
		return c.json({ slug: result.slug, title: result.title, public: result.isPublic, updatedAt: result.updatedAt });
	});


	// 삭제. 관리자 전용.
	app.delete("/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug");
		if (!validSlug(slug)) {
			return c.json({ error: "Invalid slug" }, 400);
		}
		const store = c.get("store");
		const existing = await getPage(store, slug);
		if (!existing) return c.json({ error: "Not found" }, 404);
		await deletePage(store, slug);
		return c.json({ ok: true });
	});

	return app;
}