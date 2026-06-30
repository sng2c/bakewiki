import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { getPage, createPage, updatePage, deletePage, renamePage, generateSlug, deriveSlugFromTitle, migrateUploads, rewriteUploadLinks } from "../pages/store.js";
import { parseDocument, extractTitle, extractPublic, ensureHeading, buildDocument } from "../pages/frontmatter.js";
import { renderTemplate } from "../render/hbs.js";

export function webEditRoutes(): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// 디렉토리 + 제목에서 슬러그 조합. index 특수 처리.
	function computeSlug(directory: string, title: string): string {
		const slugPart = deriveSlugFromTitle(title);
		if (!slugPart) return generateSlug();
		if (!directory) return slugPart;
		return `${directory}/${slugPart}`;
	}

	// 디렉토리 추출: 슬러그에서 마지막 세그먼트 제거. index는 빈 문자열.
	function extractDirectory(slug: string): string {
		if (slug === "index") return "";
		const idx = slug.lastIndexOf("/");
		return idx < 0 ? "" : slug.slice(0, idx);
	}

	// /edit 와 /edit/ → 새 문서
	app.get("/edit", requireAuth, (c) => {
		return c.html(renderTemplate("editor", {
			page: null, slug: "", directory: "", public: true, body: "",
		}, { title: "New page", user: true, q: "", needsRender: true }));
	});

	// /edit/:slug{.+} → 기존 문서 편집
	app.get("/edit/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug")!;
		const store = c.get("store");
		const page = await getPage(store, slug);
		if (!page) {
			return c.html(renderTemplate("editor", {
				page: null, slug, directory: extractDirectory(slug), public: true, body: "",
			}, { title: "New page", user: true, q: "", needsRender: true }));
		}
		const doc = parseDocument(page.content);
		return c.html(renderTemplate("editor", {
			page, slug,
			directory: extractDirectory(slug),
			public: extractPublic(doc),
			body: doc.body,
		}, { title: `Edit: ${page.title}`, user: true, q: "", needsRender: true }));
	});

	// 저장 (POST /edit). directory/public/content 필드 사용.
	app.post("/edit", requireAuth, async (c) => {
		const form = await c.req.formData();
		const originalSlug = String(form.get("originalSlug") ?? "").trim();
		const directory = String(form.get("directory") ?? "").trim();
		const isPublic = form.get("public") === "on";
		let body = String(form.get("content") ?? "");

		// 본문에서 첫 # 헤딩 추출 → 타이틀 → 슬러그 유도
		const doc = parseDocument(buildDocument(isPublic, body));
		const title = extractTitle(doc);

		let slug: string;
		if (originalSlug) {
			// 기존 문서 편집 — 슬러그 변경은 명시적 rename으로만
			slug = originalSlug;
		} else {
			// 새 문서 — 디렉토리 + 타이틀에서 슬러그 유도
			if (title) {
				slug = computeSlug(directory, title);
			} else {
				slug = generateSlug();
			}
		}

		// 본문에 # 헤딩이 없고 타이틀을 알 수 있으면 헤딩 추가
		if (title) {
			body = ensureHeading(body, title);
		}
		const content = buildDocument(isPublic, body);
		const store = c.get("store");

		if (originalSlug) {
			// 기존 문서 — 콘텐츠 업데이트
			await updatePage(store, slug, content);
		} else {
			// 새 문서
			const existing = await getPage(store, slug);
			if (existing) {
				await updatePage(store, slug, content);
			} else {
				await createPage(store, slug, content);
			}
			// 임시 업로드를 실제 slug로 이관 + 본문 링크 갱신
			const migrated = await migrateUploads(store.dataDir, "", slug);
			if (migrated.length > 0) {
				const page = await getPage(store, slug);
				if (page) {
					const newContent = rewriteUploadLinks(page.content, migrated);
					await updatePage(store, slug, newContent);
				}
			}
		}
		return c.redirect(`/pages/${slug}`);
	});

	// 삭제 (POST /delete/:slug)
	app.post("/delete/:slug{.+}", requireAuth, async (c) => {
		const slug = c.req.param("slug")!;
		const store = c.get("store");
		await deletePage(store, slug);
		return c.redirect("/");
	});

	return app;
}