import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { verifyPassword } from "./password.js";
import { issueSession, revokeToken } from "./token.js";
import { verifyToken } from "./jwt.js";
import { renderTemplate } from "../render/hbs.js";

const COOKIE_NAME = "bakewiki_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export function authRoutes(): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// 로그인 페이지
	app.get("/login", (c) => {
		const user = c.get("user");
		if (user) return c.redirect("/");
		return c.html(renderTemplate("login", { error: null }, { title: "Login", user: false, q: "" }));
	});

	// 로그인 처리
	app.post("/login", async (c) => {
		const form = await c.req.formData();
		const email = String(form.get("email") ?? "");
		const password = String(form.get("password") ?? "");

		const store = c.get("store");
		const user = store.auth.users.find((u) => u.email === email);
		const ok = await verifyPassword(password, user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinin");
		if (!user || !ok) {
			return c.html(renderTemplate("login", { error: "Invalid credentials" }, { title: "Login", user: false, q: "" }), 401);
		}

		const { token, expiresAt } = await issueSession(store, user.id);
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
		const store = c.get("store");
		const bearer = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
		const cookie = getCookie(c, COOKIE_NAME);
		const claims = await verifyToken(bearer ?? cookie ?? "");
		if (claims) await revokeToken(store, claims.jti);
		deleteCookie(c, COOKIE_NAME, { path: "/" });
		return c.redirect("/");
	});

	return app;
}