import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

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

// title 추출: 첫 # 헤딩만 사용. frontmatter.title은 무시.
export function extractTitle(doc: ParsedDocument): string | null {
	const heading = doc.body.match(/^#\s+(.+)$/m);
	if (heading) return heading[1].trim();
	return null;
}

// title을 본문 첫 # 헤딩에서 추출. 헤딩이 없으면 제목을 헤딩으로 추가.
export function ensureHeading(body: string, title: string): string {
	const heading = body.match(/^#\s+(.+)$/m);
	if (heading) return body;
	return `# ${title}\n\n${body}`;
}

// public 추출: frontmatter.public (boolean, 기본 true)
export function extractPublic(doc: ParsedDocument): boolean {
	const p = doc.frontmatter?.public;
	if (typeof p === "boolean") return p;
	return true;
}

// public + body → GFM 문서 조립. frontmatter에는 public만 포함.
export function buildDocument(isPublic: boolean, body: string): string {
	const fm = stringifyYaml({ public: isPublic }).trimEnd();
	return `---\n${fm}\n---\n${body}`;
}
