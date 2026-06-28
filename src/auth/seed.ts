import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";
import type { DB } from "../db/index.js";
import { hashPassword } from "./password.js";
import { issueApiKey } from "./token.js";

// 임시 관리자 seed (멱등). CLI init 단계에서 정식 교체 예정.
// 성공 시 { apiKey } 반환 (최초 생성 시만).
export async function seedAdmin(
	db: DB,
	email: string,
	password: string,
): Promise<{ created: boolean; apiKey?: string }> {
	const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (existing[0]) return { created: false };

	const passwordHash = await hashPassword(password);
	await db.insert(users).values({ email, passwordHash });
	const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	const user = rows[0]!;
	const apiKey = await issueApiKey(db, user.id);
	return { created: true, apiKey };
}

// 기존 사용자에게 API 키 추가 발급 (기존 키는 유지). 이메일로 사용자 조회.
export async function issueApiKeyForEmail(db: DB, email: string): Promise<string | null> {
	const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	const user = rows[0];
	if (!user) return null;
	return issueApiKey(db, user.id);
}
