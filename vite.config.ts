import { defineConfig, type Plugin } from "vite";

// bakewiki 백엔드(Hono)를 Vite 개발 서버에 통합하는 플러그인.
// Vite가 클라이언트 자산과 HMR을 처리하고, 나머지 요청은 Hono로 전달.
function bakewikiBackend(): Plugin {
	return {
		name: "bakewiki-backend",
		configureServer(server) {
			(async () => {
				const { createBackendListener, enableDevMode } = await server.ssrLoadModule("/src/bootstrap.ts");
				enableDevMode();
				const { listener, dataDir } = await createBackendListener("./data");
				console.log(`  bakewiki backend ready (data: ${dataDir})`);

				// Hono 백엔드를 미들웨어로 마운트.
				// Vite가 처리하지 않은 모든 요청을 Hono가 처리.
				server.middlewares.use((req, res, next) => {
					listener(req, res);
				});
			})();
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
