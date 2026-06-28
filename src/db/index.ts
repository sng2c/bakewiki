import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export function resolveDbPath(): string {
	const fromEnv = process.env.BAKEWIKI_DB_PATH;
	if (fromEnv) return fromEnv;
	return path.join(os.homedir(), ".bakewiki", "data", "bakewiki.db");
}

export type DB = ReturnType<typeof initDb>;

export function initDb(dbPath?: string) {
	const resolved = dbPath ?? resolveDbPath();
	const sqlite = new Database(resolved);
	sqlite.pragma("journal_mode = WAL");
	return drizzle(sqlite, { schema });
}
