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

	// 디렉토리 추출: 슬러그에서 마지막 세그먼트 제거.
	function extractDirectory(slug: string): string {
		const idx = slug.lastIndexOf("/");
		return idx < 0 ? "" : slug.slice(0, idx);
	}

	// 슬러그에서 마지막 세그먼트(=파일명 부분) 추출
	function extractLastSegment(slug: string): string {
		const idx = slug.lastIndexOf("/");
		return idx < 0 ? slug : slug.slice(idx + 1);
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
			const lastSeg = extractLastSegment(slug);
			const defaultBody = lastSeg ? `# ${lastSeg}\n\n` : "";
			return c.html(renderTemplate("editor", {
				page: null, slug, directory: extractDirectory(slug), public: true, body: defaultBody,
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

		// 본문에서 첫 # 헤딩 추출 → 타이틀
		const doc = parseDocument(buildDocument(isPublic, body));
		const title = extractTitle(doc);

		let slug: string;
		if (originalSlug) {
			// 기존 문서 편집 — 디렉토리 + 타이틀에서 새 슬러그 계산
			const titlePart = title ? deriveSlugFromTitle(title) : extractLastSegment(originalSlug);
			slug = titlePart ? computeSlug(directory, title!) : originalSlug;
			if (!slug) slug = originalSlug;
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
		let content = buildDocument(isPublic, body);
		const store = c.get("store");

		if (originalSlug) {
			// 기존 문서 편집
			if (slug !== originalSlug) {
				// 슬러그 변경 → rename (업로드 파일 이관만, 본문 링크는 동적 변환됨)
				const renamed = await renamePage(store, originalSlug, slug);
				if (!renamed) {
					// 대상 슬러그가 이미 존재하면 원래 슬러그로 되돌림
					slug = originalSlug;
				} else {
					slug = renamed.slug;
				}
			}
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
				const updated = await getPage(store, slug);
				if (updated) {
					const newContent = rewriteUploadLinks(updated.content, migrated);
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