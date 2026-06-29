import crypto from "node:crypto";
import { serve } from "@hono/node-server";
import { resolveDataDir, initDataDir, readAuth, readConfig, writeConfig } from "../data.js";
import { buildSearchIndex } from "../pages/search.js";
import { setJwtSecret } from "../auth/jwt.js";
import { createApp } from "../app.js";

// 로컬 HTTP 서버 부팅. 시작 시 검색 인덱스 빌드 + JWT 시크릿 초기화.
export async function serveCommand(opts: { port?: number; hostname?: string; dataDir?: string } = {}): Promise<void> {
	const port = opts.port ?? Number(process.env.BAKEWIKI_PORT ?? 3000);
	const hostname = opts.hostname ?? process.env.BAKEWIKI_HOST ?? "127.0.0.1";
	const dataDir = resolveDataDir(opts.dataDir);

	await initDataDir(dataDir);

	// 설정 로드 (없으면 자동 생성 + 영속화)
	const config = await readConfig(dataDir);
	if (!config.jwtSecret) {
		config.jwtSecret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
	}
	await writeConfig(dataDir, config);
	setJwtSecret(config.jwtSecret);

	const auth = await readAuth(dataDir);
	const store = { dataDir, auth };

	// 검색 인덱스 빌드
	await buildSearchIndex(dataDir);

	const app = createApp(store);

	serve({ fetch: app.fetch, port, hostname }, (info) => {
		console.log(`bakewiki serving on http://${info.address}:${info.port}`);
		console.log(`  data: ${dataDir}`);
	});
}