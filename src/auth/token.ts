import { signToken } from "./jwt.js";
import type { AuthData } from "../data.js";
import type { Store } from "../env.js";

export const SESSION_TTL = "7d"; // 웹 세션 만료

// ── 영속화 헬퍼 ──
import { writeAuth } from "../data.js";

async function persist(store: Store): Promise<void> {
	await writeAuth(store.dataDir, store.auth);
}

// ── 웹 세션 토큰 발급 (단기, 만료 있음) ──
export async function issueSession(store: Store, userId: number): Promise<{ token: string; expiresAt: Date }> {
	const jti = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	const token = await signToken({ jti, userId, type: "session" }, SESSION_TTL);
	store.auth.tokens.push({ jti, userId, type: "session", expiresAt: expiresAt.toISOString(), createdAt: new Date().toISOString(), lastUsedAt: null });
	await persist(store);
	return { token, expiresAt };
}

// ── API 키: 사용자당 최대 1개. 있으면 재발급, 없으면 새로 발급. ──
export async function issueApiKey(store: Store, userId: number): Promise<string> {
	const existing = store.auth.tokens.find((t) => t.userId === userId && t.type === "api");
	if (existing) {
		// 기존 키 재발급: 기존 jti 폐기 + 새 키 발급
		store.auth.tokens = store.auth.tokens.filter((t) => t.jti !== existing.jti);
	}
	const jti = crypto.randomUUID();
	const token = await signToken({ jti, userId, type: "api" }, null);
	store.auth.tokens.push({ jti, userId, type: "api", expiresAt: null, createdAt: new Date().toISOString(), lastUsedAt: null });
	await persist(store);
	return token;
}

// ── 기존 API 키 조회 (있으면 반환, 없으면 null) ──
export function getApiKey(store: Store, userId: number): string | null {
	const existing = store.auth.tokens.find((t) => t.userId === userId && t.type === "api");
	if (!existing) return null;
	// 원본 JWT는 저장하지 않으므로, 존재 여부만 확인. 실제 토큰은 발급 시에만 표시.
	// 재발급이 필요하면 issueApiKey 호출.
	return existing.jti; // 존재 표시용
}

// ── 토큰 유효성 확인 + lastUsedAt 갱신 ──
export function touchToken(store: Store, jti: string): { userId: number; type: "session" | "api" } | null {
	const row = store.auth.tokens.find((t) => t.jti === jti);
	if (!row) return null;
	if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) return null;
	row.lastUsedAt = new Date().toISOString();
	// lastUsedAt 갱신은 비동기로 저장 (응답 지연 방지)
	writeAuth(store.dataDir, store.auth).catch(() => {});
	return { userId: row.userId, type: row.type };
}

// ── 단일 토큰 폐기 ──
export async function revokeToken(store: Store, jti: string): Promise<void> {
	store.auth.tokens = store.auth.tokens.filter((t) => t.jti !== jti);
	await persist(store);
}

// ── 사용자 전체 토큰 폐기 ──
export async function revokeAllUserTokens(store: Store, userId: number): Promise<void> {
	store.auth.tokens = store.auth.tokens.filter((t) => t.userId !== userId);
	await persist(store);
}