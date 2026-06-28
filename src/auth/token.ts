import { eq, and, or, isNull, gt } from "drizzle-orm";
import { tokens } from "../db/schema.js";
import type { DB } from "../db/index.js";
import { signToken } from "./jwt.js";

export const SESSION_TTL = "7d"; // 웹 세션 만료

// 웹 세션 토큰 발급 (단기, 만료 있음). 쿠키에 저장.
export async function issueSession(db: DB, userId: number): Promise<{ token: string; expiresAt: Date }> {
	const jti = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	const token = await signToken({ jti, userId, type: "session" }, SESSION_TTL);
	await db.insert(tokens).values({ jti, userId, type: "session", expiresAt });
	return { token, expiresAt };
}

// API 키 발급 (장기, 만료 없음). Bearer 헤더용.
export async function issueApiKey(db: DB, userId: number): Promise<string> {
	const jti = crypto.randomUUID();
	const token = await signToken({ jti, userId, type: "api" }, null);
	await db.insert(tokens).values({ jti, userId, type: "api", expiresAt: null });
	return token;
}

// 토큰이 allowlist에 존재하고 유효한지(만료 전이거나 만료 없음) 확인. lastUsedAt 갱신.
export async function touchToken(db: DB, jti: string): Promise<{ userId: number; type: "session" | "api" } | null> {
	const rows = await db
		.select({ userId: tokens.userId, type: tokens.type, expiresAt: tokens.expiresAt })
		.from(tokens)
		.where(eq(tokens.jti, jti))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
	await db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.jti, jti));
	return { userId: row.userId, type: row.type };
}

// 단일 토큰 폐기 (revoke)
export async function revokeToken(db: DB, jti: string): Promise<void> {
	await db.delete(tokens).where(eq(tokens.jti, jti));
}

// 특정 사용자의 모든 토큰 폐기 (비밀번호 변경 시 본인만 무효)
export async function revokeAllUserTokens(db: DB, userId: number): Promise<void> {
	await db.delete(tokens).where(eq(tokens.userId, userId));
}
