import { getRequestListener } from "@hono/node-server";
import crypto from "node:crypto";
import { resolveDataDir, initDataDir, readAuth, readConfig, writeConfig } from "./data.js";
import { buildSearchIndex } from "./pages/search.js";
import { setJwtSecret } from "./auth/jwt.js";
import { createApp } from "./app.js";
import { setDevMode } from "./render/hbs.js";

// Hono 앱을 부트스트랩하여 Node http 요청 리스너로 반환.
// Vite 개발 서버와 프로덕션 serve.ts 모두에서 사용.
export async function createBackendListener(dataDirArg?: string) {
	const dataDir = resolveDataDir(dataDirArg);
	await initDataDir(dataDir);

	const config = await readConfig(dataDir);
	if (!config.jwtSecret) {
		config.jwtSecret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
	}
	await writeConfig(dataDir, config);
	setJwtSecret(config.jwtSecret);

	const auth = await readAuth(dataDir);
	const store = { dataDir, auth };

	await buildSearchIndex(dataDir);

	const app = await createApp(store);
	return { listener: getRequestListener(app.fetch), dataDir };
}

// 개발 모드 플래그 설정
export function enableDevMode(): void {
	setDevMode(true);
}
