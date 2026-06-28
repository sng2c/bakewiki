import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import type { DB } from "../db/index.js";
import type { AppEnv } from "../env.js";
import { users } from "../db/schema.js";
import { verifyPassword } from "../auth/password.js";
import { issueSession, revokeToken } from "../auth/token.js";
import { verifyToken } from "../auth/jwt.js";
import { renderTemplate } from "../render/hbs.js";

const COOKIE_NAME = "bakewiki_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export function webAuthRoutes(db: DB): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	// 로그인 페이지
	app.get("/login", (c) => {
		const user = c.get("user");
		if (user) return c.redirect("/");
		return c.html(renderTemplate("login", { error: null }, { title: "Login", user: false, q: "" }));
	});

	// 로그인 처리 (폼 전송)
	app.post("/login", async (c) => {
		const form = await c.req.formData();
		const email = String(form.get("email") ?? "");
		const password = String(form.get("password") ?? "");

		const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
		const user = rows[0];
		const ok = await verifyPassword(password, user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinin");
		if (!user || !ok) {
			return c.html(renderTemplate("login", { error: "Invalid credentials" }, { title: "Login", user: false, q: "" }), 401);
		}

		const { token, expiresAt } = await issueSession(db, user.id);
		setCookie(c, COOKIE_NAME, token, {
			httpOnly: true,
			sameSite: "Lax",
			path: "/",
			maxAge: SESSION_MAX_AGE,
			expires: expiresAt,
		});
		return c.redirect("/");
	});

	// 로그아웃
	app.post("/logout", async (c) => {
		const bearer = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
		const cookie = getCookie(c, COOKIE_NAME);
		const claims = await verifyToken(bearer ?? cookie ?? "");
		if (claims) await revokeToken(db, claims.jti);
		deleteCookie(c, COOKIE_NAME, { path: "/" });
		return c.redirect("/");
	});

	return app;
}
