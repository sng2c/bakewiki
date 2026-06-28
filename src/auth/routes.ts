import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";
import type { DB } from "../db/index.js";
import type { AppEnv } from "../env.js";
import { verifyPassword } from "./password.js";
import { issueSession, revokeToken } from "./token.js";
import { verifyToken } from "./jwt.js";

const COOKIE_NAME = "bakewiki_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7d (초)

export function authRoutes(db: DB): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	app.post("/login", async (c) => {
		const body = await c.req.json().catch(() => null);
		const email = body?.email;
		const password = body?.password;
		if (typeof email !== "string" || typeof password !== "string") {
			return c.json({ error: "email and password are required" }, 400);
		}

		const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
		const user = rows[0];
		// 타이밍 공격 방지: 사용자가 없어도 항상 compare 실행
		const ok = await verifyPassword(password, user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinin");
		if (!user || !ok) {
			return c.json({ error: "Invalid credentials" }, 401);
		}

		const { token, expiresAt } = await issueSession(db, user.id);
		setCookie(c, COOKIE_NAME, token, {
			httpOnly: true,
			sameSite: "Lax",
			path: "/",
			maxAge: SESSION_MAX_AGE,
			expires: expiresAt,
		});
		return c.json({ ok: true, user: { id: user.id, email: user.email } });
	});

	app.post("/logout", async (c) => {
		const bearer = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
		const cookie = getCookie(c, COOKIE_NAME);
		const claims = await verifyToken(bearer ?? cookie ?? "");
		if (claims) {
			await revokeToken(db, claims.jti);
		}
		deleteCookie(c, COOKIE_NAME, { path: "/" });
		return c.json({ ok: true });
	});

	app.get("/me", (c) => {
		const user = c.get("user");
		if (!user) return c.json({ user: null });
		return c.json({ user: { id: user.id } });
	});

	return app;
}
