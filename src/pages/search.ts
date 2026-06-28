import type { Database } from "better-sqlite3";
import type { DB } from "../db/index.js";

// Drizzle의 better-sqlite3 드라이버 raw 인스턴스 추출
function rawDb(db: DB): Database {
	// @ts-expect-error — drizzle better-sqlite3 driver exposes underlying session.client
	return db.$client ?? db.session?.client;
}

const SETUP_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
	slug, title, content
);

CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
	INSERT INTO pages_fts(rowid, slug, title, content)
	VALUES (new.id, new.slug, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
	INSERT INTO pages_fts(pages_fts, rowid, slug, title, content)
	VALUES ('delete', old.id, old.slug, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
	INSERT INTO pages_fts(pages_fts, rowid, slug, title, content)
	VALUES ('delete', old.id, old.slug, old.title, old.content);
	INSERT INTO pages_fts(rowid, slug, title, content)
	VALUES (new.id, new.slug, new.title, new.content);
END;
`;

const BACKFILL_SQL = `
INSERT INTO pages_fts(rowid, slug, title, content)
SELECT id, slug, title, content FROM pages
WHERE id NOT IN (SELECT rowid FROM pages_fts);
`;

// 멱등: FTS5 테이블 + 트리거 생성 + 기존 데이터 backfill. serve 시작 시 1회 호출.
export function ensureFts(db: DB): void {
	const raw = rawDb(db);
	raw.exec(SETUP_SQL);
	raw.exec(BACKFILL_SQL);
}

export type SearchResult = {
	slug: string;
	title: string;
	snippet: string;
};

const SEARCH_SQL = `
SELECT p.slug AS slug, p.title AS title,
	snippet(pages_fts, 2, '<mark>', '</mark>', '...', 20) AS snippet,
	p.public AS public
FROM pages_fts
JOIN pages p ON p.id = pages_fts.rowid
WHERE pages_fts MATCH ?
ORDER BY rank
`;

export function searchPages(db: DB, query: string, includePrivate = false): SearchResult[] {
	const raw = rawDb(db);
	const rows = raw.prepare(SEARCH_SQL).all(query) as Array<{
		slug: string;
		title: string;
		snippet: string;
		public: number;
	}>;
	return rows
		.filter((r) => includePrivate || r.public === 1)
		.map((r) => ({ slug: r.slug, title: r.title, snippet: r.snippet }));
}
