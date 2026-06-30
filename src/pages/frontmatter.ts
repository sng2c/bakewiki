import fs from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type Frontmatter = Record<string, unknown>;

export type MetaData = {
	public: boolean;
	updatedAt: string;
	title?: string;
};

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

// title 추출: 첫 # 헤딩만 사용. 폴백용.
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

// meta.yml 읽기. 파일이 없거나 파싱 실패 시 기본값 반환.
export async function readMeta(metaFilePath: string): Promise<MetaData> {
	try {
		const content = await fs.readFile(metaFilePath, "utf-8");
		const parsed = parseYaml(content);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return { public: true, updatedAt: new Date().toISOString() };
		}
		return {
			public: typeof parsed.public === "boolean" ? parsed.public : true,
			updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
			title: typeof parsed.title === "string" ? parsed.title : undefined,
		};
	} catch {
		return { public: true, updatedAt: new Date().toISOString() };
	}
}

// meta.yml 쓰기.
export async function writeMeta(metaFilePath: string, meta: MetaData): Promise<void> {
	const data: Record<string, unknown> = { public: meta.public, updatedAt: meta.updatedAt };
	if (meta.title !== undefined) data.title = meta.title;
	const content = stringifyYaml(data).trimEnd() + "\n";
	await fs.writeFile(metaFilePath, content, "utf-8");
}