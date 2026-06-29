import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { Store, AuthUser } from "../env.js";
import { verifyToken } from "./jwt.js";
import { touchToken } from "./token.js";

export type { AuthUser };

// 통합 인증 미들웨어: 쿠키(bakewiki_session) OR Authorization: Bearer
// JWT 서명 검증 + allowlist(touchToken) 확인 → user 주입 (선택적, 없으면 통과)
export async function auth(c: Context<{ Variables: { store: Store; user: AuthUser | null } }>, next: Next) {
	const bearer = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
	const cookie = getCookie(c, "bakewiki_session");
	const raw = bearer ?? cookie;

	if (raw) {
		const claims = await verifyToken(raw);
		if (claims) {
			const store = c.get("store");
			const result = touchToken(store, claims.jti);
			if (result && result.userId === claims.userId) {
				c.set("user", { id: claims.userId });
			}
		}
	}
	await next();
}

// 보호 라우트용: 인증된 관리자만 통과
export async function requireAuth(c: Context<{ Variables: { store: Store; user: AuthUser | null } }>, next: Next) {
	if (!c.get("user")) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
}