import { parse as parseYaml } from "yaml";

export type Frontmatter = Record<string, unknown>;

export type ParsedDocument = {
	frontmatter: Frontmatter | null;
	body: string; // frontmatter 제거된 본문
};

// GFM 문서에서 YAML frontmatter(--- 구분) 분리. 없으면 frontmatter=null, body=원문.
export function parseDocument(raw: string): ParsedDocument {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { frontmatter: null, body: raw };
	const [, yaml, body] = match;
	let frontmatter: Frontmatter | null = null;
	try {
		const parsed = parseYaml(yaml);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			frontmatter = parsed as Frontmatter;
		}
	} catch {
		frontmatter = null;
	}
	return { frontmatter, body };
}

// title 추출: frontmatter.title > 없으면 첫 # 헤딩 > 없으면 slug fallback(호출자 책임)
export function extractTitle(doc: ParsedDocument): string | null {
	const fmTitle = doc.frontmatter?.title;
	if (typeof fmTitle === "string" && fmTitle.trim()) return fmTitle.trim();
	const heading = doc.body.match(/^#\s+(.+)$/m);
	if (heading) return heading[1].trim();
	return null;
}

// public 추출: frontmatter.public (boolean, 기본 true)
export function extractPublic(doc: ParsedDocument): boolean {
	const p = doc.frontmatter?.public;
	if (typeof p === "boolean") return p;
	return true;
}
