import { createServer as createHttpServer } from "node:http";
import { createBackendListener } from "../bootstrap.js";

// 프로덕션 HTTP 서버 부팅.
// Vite 미들웨어 없이 정적 파일 + Hono 백엔드만 실행.
export async function serveCommand(opts: { port?: number; hostname?: string; dataDir?: string } = {}): Promise<void> {
	const port = opts.port ?? Number(process.env.BAKEWIKI_PORT ?? 3000);
	const hostname = opts.hostname ?? process.env.BAKEWIKI_HOST ?? "127.0.0.1";

	const { listener, dataDir } = await createBackendListener(opts.dataDir);

	const server = createHttpServer(listener);

	server.listen(port, hostname, () => {
		console.log(`bakewiki serving on http://${hostname}:${port}`);
		console.log(`  data: ${dataDir}`);
	});
}
