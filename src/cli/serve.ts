import { serve } from "@hono/node-server";
import { initDb } from "../db/index.js";
import { runMigrations } from "../migrate.js";
import { createApp } from "../app.js";

// 로컬 HTTP 서버 부팅. 시작 시 자동 마이그레이션.
export function serveCommand(opts: { port?: number } = {}): void {
	const port = opts.port ?? Number(process.env.BAKEWIKI_PORT ?? 3000);

	const db = initDb();
	runMigrations(db);
	const app = createApp(db);

	serve({ fetch: app.fetch, port }, (info) => {
		console.log(`bakewiki serving on http://localhost:${info.port}`);
	});
}
