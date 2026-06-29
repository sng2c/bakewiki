import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";

// ── JWT 시크릿: 모듈 수준에서 설정 ──
// config.yml에서 로드한 시크릿을 서버 시작 시 주입.
let _secretKey: Uint8Array | null = null;

export function setJwtSecret(secret: string): void {
	_secretKey = new TextEncoder().encode(secret);
}

function secretKey(): Uint8Array {
	if (_secretKey) return _secretKey;
	throw new Error("JWT secret not initialized. Call setJwtSecret() first.");
}

export type TokenClaims = {
	jti: string;
	userId: number;
	type: "session" | "api";
};

export async function signToken(claims: TokenClaims, expiresIn: string | null): Promise<string> {
	const builder = new SignJWT({ ...claims })
		.setProtectedHeader({ alg: ALG })
		.setIssuedAt()
		.setJti(claims.jti);
	if (expiresIn) builder.setExpirationTime(expiresIn);
	return builder.sign(secretKey());
}

export async function verifyToken(token: string): Promise<TokenClaims | null> {
	try {
		const { payload } = await jwtVerify(token, secretKey());
		if (typeof payload.userId !== "number" || typeof payload.jti !== "string") return null;
		if (payload.type !== "session" && payload.type !== "api") return null;
		return { jti: payload.jti, userId: payload.userId, type: payload.type };
	} catch {
		return null;
	}
}