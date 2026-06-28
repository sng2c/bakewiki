import type { DB } from "./db/index.js";

// 인증된 사용자 (미들웨어가 주입)
export type AuthUser = { id: number };

// Hono 컨텍스트 변수 타입. 모든 라우터/미들웨어가 공유.
export type AppEnv = {
	Variables: {
		db: DB;
		user: AuthUser | null;
	};
};;
