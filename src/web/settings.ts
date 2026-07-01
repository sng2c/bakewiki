import { Hono } from "hono";
import type { Store } from "../env.js";
import type { AuthUser } from "../env.js";
import { requireAuth } from "../auth/middleware.js";
import { issueApiKey } from "../auth/token.js";
import { readConfig, writeConfig } from "../data.js";
import { renderTemplate } from "../render/hbs.js";

export function webSettingsRoutes(): Hono<{ Variables: { store: Store; user: AuthUser | null } }> {
	const app = new Hono<{ Variables: { store: Store; user: AuthUser | null } }>();

	// 설정 페이지 (인증 필요)
	app.get("/settings", requireAuth, async (c) => {
		const store = c.get("store");
		const user = c.get("user")!;
		const userRecord = store.auth.users.find((u) => u.id === user.id);
		const hasApiKey = store.auth.tokens.some((t) => t.userId === user.id && t.type === "api");
		const apiKey = c.req.query("apiKey");
		const regenerated = c.req.query("regenerated") === "1";
		const homeSaved = c.req.query("homeSaved") === "1";
		return c.html(renderTemplate("settings", {
			email: userRecord?.email ?? "",
			hasApiKey,
			apiKey,
			regenerated,
			homeSlug: store.config.homeSlug,
			homeSaved,
		}, { title: "Settings", user: true, q: "" }));
	});

	// 홈페이지 slug 변경
	app.post("/settings/home", requireAuth, async (c) => {
		const store = c.get("store");
		const form = await c.req.formData();
		const homeSlug = String(form.get("homeSlug") ?? "").trim() || "home";
		const config = await readConfig(store.dataDir);
		config.homeSlug = homeSlug;
		await writeConfig(store.dataDir, config);
		store.config.homeSlug = homeSlug;
		return c.redirect(`/settings?homeSaved=1`);
	});

	// API 키 발급/재발급
	app.post("/settings/api-key", requireAuth, async (c) => {
		const store = c.get("store");
		const user = c.get("user")!;
		const apiKey = await issueApiKey(store, user.id);
		return c.redirect(`/settings?apiKey=${encodeURIComponent(apiKey)}&regenerated=1`);
	});

	return app;
}