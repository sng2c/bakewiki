import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	email: text("email").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

// 문서. content는 GFM 원문(frontmatter 포함) 그대로 저장 → import/export와 동일 포맷.
export const pages = sqliteTable("pages", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	slug: text("slug").notNull().unique(),
	title: text("title").notNull(),
	content: text("content").notNull(),
	public: integer("public", { mode: "boolean" }).notNull().default(true),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

// 관리되는 JWT 토큰 (allowlist). 웹 세션(type=session)과 API 키(type=api) 통합.
export const tokens = sqliteTable("tokens", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	jti: text("jti").notNull().unique(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	type: text("type", { enum: ["session", "api"] }).notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp" }), // nullable: api는 만료 없음
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});
