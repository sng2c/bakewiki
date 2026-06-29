import type { Store } from "../env.js";
import { hashPassword } from "./password.js";
import { issueApiKey } from "./token.js";

// 관리자 시드 (멱등). 최초 생성 시 API 키 반환.
export async function seedAdmin(
	store: Store,
	email: string,
	password: string,
): Promise<{ created: boolean; apiKey?: string }> {
	const existing = store.auth.users.find((u) => u.email === email);
	if (existing) return { created: false };

	const passwordHash = await hashPassword(password);
	const id = store.auth.nextUserId++;
	const user = { id, email, passwordHash, createdAt: new Date().toISOString() };
	store.auth.users.push(user);
	const apiKey = await issueApiKey(store, user.id);
	return { created: true, apiKey };
}