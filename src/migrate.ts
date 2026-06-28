import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DB } from "./db/index.js";
import { migrate as drizzleMigrate } from "drizzle-orm/better-sqlite3/migrator";

// 마이그레이션 파일 위치 (빌드 후에도 dist/ 기준 또는 소스 기준)
function migrationsFolder(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	// 개발(tsx): src/ → 상위 drizzle/
	// 빌드(dist): dist/ → 상위 drizzle/ (빌드 시 drizzle/ 함께 패키징 필요)
	const candidate = path.resolve(here, "..", "drizzle");
	return candidate;
}

// 미처리 마이그레이션 적용. 멱등.
export function runMigrations(db: DB): void {
	drizzleMigrate(db, { migrationsFolder: migrationsFolder() });
}
