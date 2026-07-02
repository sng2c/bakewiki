import fs from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type Frontmatter = Record<string, unknown>;

export type MetaData = {
	public: boolean;
	updatedAt: string;
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

// meta.yml 읽기. 파일이 없거나 파싱 실패 시 기본값 반환. title은 더 이상 관리하지 않음.
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
		};
	} catch {
		return { public: true, updatedAt: new Date().toISOString() };
	}
}

// meta.yml 쓰기. title은 더 이상 저장하지 않는다.
export async function writeMeta(metaFilePath: string, meta: MetaData): Promise<void> {
	const data: Record<string, unknown> = { public: meta.public, updatedAt: meta.updatedAt };
	const content = stringifyYaml(data).trimEnd() + "\n";
	await fs.writeFile(metaFilePath, content, "utf-8");
}