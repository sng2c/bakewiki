import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";

function secretKey(): Uint8Array {
	const raw = process.env.BAKEWIKI_JWT_SECRET;
	if (!raw) throw new Error("BAKEWIKI_JWT_SECRET is not set");
	return new TextEncoder().encode(raw);
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
