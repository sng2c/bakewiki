import { resolveDataDir, initDataDir } from "../data.js";

// 데이터 디렉토리 초기화. 관리자 생성은 별도: bakewiki admin create
export async function initCommand(dataDir?: string): Promise<void> {
	const dir = resolveDataDir(dataDir);
	console.log(`Data directory: ${dir}`);

	await initDataDir(dir);

	console.log("Initialized.");
	console.log("Next: Run `bakewiki admin create --data <path>` to create an admin account.");
	console.log("Then:  Run `bakewiki serve --data <path>` to start the server.");
}