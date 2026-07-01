import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { createPage, updatePage, getPage, deletePage, renamePage, listPages } from "../pages/store.js";
import { parseDocument } from "../pages/frontmatter.js";

// slug에서 부모 경로 추출: "tech/web/HTTP" → "tech/web", "index" → ""
function parentPath(slug: string): string {
	const idx = slug.lastIndexOf("/");
	return idx < 0 ? "" : slug.substring(0, idx);
}

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
		return c.json({ pages: list.map(p => ({ path: parentPath(p.slug), slug: p.slug, title: p.title, public: p.isPublic, updatedAt: p.updatedAt })) });
	});

	// 단일 문서. 비공개 문서는 미인증 → 404.
	app.get("/:slug{.+}", async (c) => {
		const slug = c.req.param("slug");
		if (!validSlug(slug)) {
			return c.json({ error: "Invalid slug" }, 400);
		}
		const store = c.get("store");

		const page = await getPage(store, slug);
		if (!page) return c.json({ error: "Not found" }, 404);
		const user = c.get("user");
		if (!page.isPublic && !user) {
			return c.json({ error: "Not found" }, 404);
		}
		return c.json({ page: { path: parentPath(page.slug), slug: page.slug, title: page.title, content: page.content, public: page.isPublic, updatedAt: page.updatedAt } });
	});

	// 생성 또는 수정 (upsert). 관리자 전용.
	app.post("/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug");
		if (!validSlug(slug)) {
			return c.json({ error: "Invalid slug" }, 400);
		}

		const body = await c.req.json().catch(() => null);
		const content = body?.content;
		const title = typeof body?.title === "string" ? body.title : undefined;
		if (typeof content !== "string") {
			return c.json({ error: "content (string) is required" }, 400);
		}

		const store = c.get("store");
		const existing = await getPage(store, slug);
		const saved = existing
			? await updatePage(store, slug, content, { title })
			: await createPage(store, slug, content, { title });

		return c.json({
			path: parentPath(saved!.slug),
			slug: saved!.slug,
			title: saved!.title,
			public: saved!.isPublic,
			updatedAt: saved!.updatedAt,
		});
	});

	// 부분 업데이트 (PATCH). 관리자 전용.
	// { "slug": "new-slug" } → 이름 변경
	// { "public": true/false } → 공개여부 변경
	// { "body": "..." } → 본문 변경
	// { "public": false, "body": "..." } → 복합 변경
	// { "slug": "new", "public": true } → 이름 변경 + 공개여부 변경
	app.patch("/:slug{.+}", requireAuth, async (c) => {
		const oldSlug = c.req.param("slug");
		if (!validSlug(oldSlug)) {
			return c.json({ error: "Invalid slug" }, 400);
		}

		const body = await c.req.json().catch(() => null);
		if (!body || typeof body !== "object") {
			return c.json({ error: "JSON body required" }, 400);
		}

		const store = c.get("store");
		const hasSlugChange = typeof body.slug === "string" && body.slug !== oldSlug;
		const hasPublic = typeof body.public === "boolean";
		const hasBody = typeof body.body === "string";
		const hasTitle = typeof body.title === "string";

		// 변경할 것이 없으면 400
		if (!hasSlugChange && !hasPublic && !hasBody && !hasTitle) {
			return c.json({ error: "No fields to update. Provide slug, public, or body." }, 400);
		}

		// slug 변경이 있으면 먼저 rename
		let currentSlug = oldSlug;
		if (hasSlugChange) {
			const newSlug = body.slug as string;
			if (!validSlug(newSlug)) {
				return c.json({ error: "Invalid new slug" }, 400);
			}
			const result = await renamePage(store, oldSlug, newSlug);
			if (!result) return c.json({ error: "Not found or target slug already exists" }, 409);
			currentSlug = newSlug;
		}

		// public, title 또는 body 변경이 있으면 콘텐츠/메타 업데이트
		if (hasPublic || hasBody || hasTitle) {
			const page = await getPage(store, currentSlug);
			if (!page) return c.json({ error: "Not found" }, 404);
			const content = hasBody ? body.body as string : page.content;
			const options: { isPublic?: boolean; title?: string } = {};
			if (hasPublic) options.isPublic = body.public as boolean;
			if (hasTitle) options.title = body.title as string;
			const saved = await updatePage(store, currentSlug, content, options);
			return c.json({ path: parentPath(saved!.slug), slug: saved!.slug, title: saved!.title, public: saved!.isPublic, updatedAt: saved!.updatedAt });
		}

		// slug만 변경한 경우
		const page = await getPage(store, currentSlug);
		return c.json({ path: parentPath(page!.slug), slug: page!.slug, title: page!.title, public: page!.isPublic, updatedAt: page!.updatedAt });
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