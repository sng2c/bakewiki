import type { AuthData, Config } from "./data.js";

// 인증된 사용자 (미들웨어가 주입)
export type AuthUser = { id: number };

// 파일시스템 기반 저장소 컨텍스트
export interface Store {
	dataDir: string;
	auth: AuthData;
	config: Config;
}

// Hono 컨텍스트 변수 타입. 모든 라우터/미들웨어가 공유.
export type AppEnv = {
	Variables: {
		store: Store;
		user: AuthUser | null;
	};
};