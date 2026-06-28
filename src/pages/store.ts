import { eq } from "drizzle-orm";
import { pages } from "../db/schema.js";
import type { DB } from "../db/index.js";
import { parseDocument, extractTitle, extractPublic, type ParsedDocument } from "./frontmatter.js";

export type Page = {
	id: number;
	slug: string;
	title: string;
	content: string;
	isPublic: boolean;
	createdAt: Date;
	updatedAt: Date;
};

export type PageSummary = Pick<Page, "slug" | "title" | "updatedAt" | "isPublic">;

function parse(raw: string): ParsedDocument & { title: string; public: boolean } {
	const doc = parseDocument(raw);
	return { ...doc, title: extractTitle(doc) ?? "", public: extractPublic(doc) };
}

export async function getPage(db: DB, slug: string): Promise<Page | null> {
	const rows = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
	return (rows[0] as Page) ?? null;
}

export async function listPages(db: DB, includePrivate = false): Promise<PageSummary[]> {
	const rows = await db
		.select({ slug: pages.slug, title: pages.title, updatedAt: pages.updatedAt, isPublic: pages.isPublic })
		.from(pages);
	return rows.filter((r) => includePrivate || r.isPublic);
}

export async function createPage(db: DB, slug: string, content: string): Promise<Page> {
	const p = parse(content);
	await db
		.insert(pages)
		.values({ slug, title: p.title, content, isPublic: p.public });
	const rows = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
	return rows[0] as Page;
}

export async function updatePage(db: DB, slug: string, content: string): Promise<Page | null> {
	const p = parse(content);
	await db
		.update(pages)
		.set({ title: p.title, content, isPublic: p.public, updatedAt: new Date() })
		.where(eq(pages.slug, slug));
	const rows = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
	return (rows[0] as Page) ?? null;
}

export async function deletePage(db: DB, slug: string): Promise<void> {
	await db.delete(pages).where(eq(pages.slug, slug));
}
