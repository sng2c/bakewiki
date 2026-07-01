import { defineConfig, type Plugin, type Connect } from "vite";

// bakewiki 백엔드(Hono)를 Vite 개발 서버의 connect 미들웨어 체인에 직접 연결.
// Vite가 클라이언트 자산과 HMR을 처리하고, 나머지는 Hono app.fetch()로.
// Hono가 404를 반환하면 next()로 Vite로 폴백 (Vite 자산 경로 포함).
function bakewikiBackend(): Plugin {
	return {
		name: "bakewiki-backend",
		configureServer(server) {
			let currentApp: { fetch: (req: Request) => Promise<Response> } | null = null;
			let dataDirLog = "";
			let reloadTimer: ReturnType<typeof setTimeout> | null = null;

			async function loadBackend() {
				const mod = await server.ssrLoadModule("/src/bootstrap.ts");
				mod.enableDevMode();
				const { app, dataDir } = await mod.createBackendListener("./data");
				dataDirLog = dataDir;
				currentApp = app;
			}

			loadBackend()
				.then(() => console.log(`  bakewiki backend ready (data: ${dataDirLog})`))
				.catch((e) => console.error("  bakewiki backend load error:", e));

			// 백엔드 소스(src/**/*.ts, client 제외) 변경 시 디바운스하여 재로드
			server.watcher.on("change", (file) => {
				const normalized = file.replace(/\\/g, "/");
				if (
					normalized.includes("/src/") &&
					!normalized.includes("/src/client/") &&
					normalized.endsWith(".ts")
				) {
					if (reloadTimer) clearTimeout(reloadTimer);
					reloadTimer = setTimeout(() => {
						const rel = normalized.split("/src/")[1];
						console.log(`  [bakewiki] backend source changed: ${rel}`);
						// 변경된 모듈과 bootstrap 무효화
						for (const f of [normalized, normalized.replace(/\/src\/.*$/, "/src/bootstrap.ts")]) {
							const m = server.moduleGraph.getModuleById(f);
							if (m) server.moduleGraph.invalidateModule(m);
						}
						loadBackend()
							.then(() => {
								console.log(`  [bakewiki] backend reloaded ✓");
								// 브라우저에 풀페이지 리로드 신호 전송
								server.ws.send({ type: "full-reload" });
							})
							.catch((e) => console.error("  [bakewiki] reload error:", e));
					}, 100);
				}
			});

			// Node http.IncomingMessage → Web Request 변환 후 app.fetch() 호출.
			// Hono가 404를 반환하면 next()로 Vite가 처리.
			const handler: Connect.NextHandleFunction = async (req, res, next) => {
				if (!currentApp) {
					res.statusCode = 503;
					res.end("backend loading...");
					return;
				}
				try {
					const protocol = (req.headers[":scheme"] as string) || "http";
					const host = req.headers.host || "localhost";
					const url = `${protocol}://${host}${req.url || "/"}`;
					const init: RequestInit = {
						method: req.method,
						headers: req.headers as Record<string, string>,
					};
					if (req.method !== "GET" && req.method !== "HEAD") {
						const chunks: Buffer[] = [];
						for await (const c of req) chunks.push(c as Buffer);
						init.body = Buffer.concat(chunks);
					}
					const resp = await currentApp.fetch(new Request(url, init));
					// 404면 Vite로 폴백
					if (resp.status === 404) return next();
					res.statusCode = resp.status;
					resp.headers.forEach((v, k) => res.setHeader(k, v));
					const body = await resp.arrayBuffer();
					res.end(Buffer.from(body));
				} catch (e) {
					next(e as Error);
				}
			};

			// 미들웨어를 Vite 내부 transform 미들웨어 *뒤*에 마운트.
			// 함수를 반환하면 Vite가 내부 미들웨어 설치 후 실행해 줌.
			return () => {
				server.middlewares.use(handler);
			};
		},
	};
}

export default defineConfig({
	appType: "custom",
	plugins: [bakewikiBackend()],
	build: {
		outDir: "dist/public",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				page: "src/client/page.ts",
				editor: "src/client/editor.ts",
			},
			output: {
				entryFileNames: "[name].js",
				chunkFileNames: "[name].js",
				assetFileNames: "[name][extname]",
			},
		},
	},
	server: {
		port: 3000,
		host: "127.0.0.1",
	},
});
