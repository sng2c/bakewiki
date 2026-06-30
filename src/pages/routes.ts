import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { createPage, updatePage, getPage, deletePage, renamePage, listPages } from "../pages/store.js";
import { parseDocument, extractPublic, buildDocument } from "../pages/frontmatter.js";
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

	// 부분 업데이트 (PATCH). 관리자 전용.
	// { "slug": "new-slug" } → 이름 변경
	// { "public": true/false } → 공개여부 변경
	// { "body": "..." } → 본문 변경 (헤딩 유지/추가)
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

		// 변경할 것이 없으면 400
		if (!hasSlugChange && !hasPublic && !hasBody) {
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

		// public 또는 body 변경이 있으면 콘텐츠 업데이트
		if (hasPublic || hasBody) {
			const page = await getPage(store, currentSlug);
			if (!page) return c.json({ error: "Not found" }, 404);
			const doc = parseDocument(page.content);
			const isPublic = hasPublic ? body.public as boolean : extractPublic(doc);
			const newBody = hasBody ? body.body as string : doc.body;
			const content = buildDocument(isPublic, newBody);
			const saved = await updatePage(store, currentSlug, content);
			return c.json({ slug: saved!.slug, title: saved!.title, public: saved!.isPublic, updatedAt: saved!.updatedAt });
		}

		// slug만 변경한 경우
		const page = await getPage(store, currentSlug);
		return c.json({ slug: page!.slug, title: page!.title, public: page!.isPublic, updatedAt: page!.updatedAt });
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