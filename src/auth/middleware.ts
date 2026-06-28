import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { DB } from "../db/index.js";
import type { AppEnv, AuthUser } from "../env.js";
import { verifyToken } from "./jwt.js";
import { touchToken } from "./token.js";

export type { AuthUser };

// 통합 인증 미들웨어: 쿠키(bakewiki_session) OR Authorization: Bearer
// JWT 서명 검증 + allowlist(touchToken) 확인 → user 주입 (선택적, 없으면 통과)
export async function auth(c: Context<AppEnv>, next: Next) {
	const bearer = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
	const cookie = getCookie(c, "bakewiki_session");
	const raw = bearer ?? cookie;

	if (raw) {
		const claims = await verifyToken(raw);
		if (claims) {
			const db: DB = c.get("db");
			const live = await touchToken(db, claims.jti);
			if (live && live.userId === claims.userId) {
				c.set("user", { id: claims.userId });
			}
		}
	}
	await next();
}

// 보호 라우트용: 인증된 관리자만 통과
export async function requireAuth(c: Context<AppEnv>, next: Next) {
	if (!c.get("user")) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
}
