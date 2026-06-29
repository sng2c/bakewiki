import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { parse as parseYaml } from "yaml";

// ── 데이터 디렉토리 해석 ──
// 반드시 CLI --data 플래그 또는 BAKEWIKI_DATA_DIR 환경변수로 지정되어야 함.
export function resolveDataDir(cliArg?: string): string {
	const dir = cliArg ?? process.env.BAKEWIKI_DATA_DIR;
	if (!dir) {
		console.error("Error: Data directory required. Use --data <path> or set BAKEWIKI_DATA_DIR.");
		process.exit(1);
	}
	return path.resolve(dir);
}

export function pagesDir(dataDir: string): string {
	return path.join(dataDir, "pages");
}

export function authPath(dataDir: string): string {
	return path.join(dataDir, "auth.json");
}

export function configPath(dataDir: string): string {
	return path.join(dataDir, "config.yml");
}

export function redirectsPath(dataDir: string): string {
	return path.join(dataDir, "redirects.json");
}

export async function initDataDir(dataDir: string): Promise<void> {
	await fs.mkdir(pagesDir(dataDir), { recursive: true });
}

// ── 설정 (config.yml) ──
export interface Config {
	jwtSecret: string;
}

const DEFAULT_CONFIG: Config = {
	jwtSecret: "",
};

export async function readConfig(dataDir: string): Promise<Config> {
	try {
		const content = await fs.readFile(configPath(dataDir), "utf-8");
		const parsed = parseYaml(content);
		if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CONFIG, jwtSecret: generateSecret() };
		return {
			jwtSecret: typeof parsed.jwtSecret === "string" && parsed.jwtSecret ? parsed.jwtSecret : generateSecret(),
		};
	} catch {
		return { ...DEFAULT_CONFIG, jwtSecret: generateSecret() };
	}
}

export async function writeConfig(dataDir: string, config: Config): Promise<void> {
	// 간단한 YAML 직렬화 (키-값 쌍 하나)
	const lines = [
		`# bakewiki 설정`,
		`# 자동 생성됨 — 직접 수정 가능`,
		`jwtSecret: "${config.jwtSecret}"`,
		``,
	];
	await fs.writeFile(configPath(dataDir), lines.join("\n"), "utf-8");
}

function generateSecret(): string {
	return crypto.randomBytes(32).toString("hex");
}

// ── 리다이렉트 매핑 (old slug → new slug) ──
export type Redirects = Record<string, string>;

export async function readRedirects(dataDir: string): Promise<Redirects> {
	try {
		const content = await fs.readFile(redirectsPath(dataDir), "utf-8");
		return JSON.parse(content);
	} catch {
		return {};
	}
}

export async function writeRedirects(dataDir: string, redirects: Redirects): Promise<void> {
	await fs.writeFile(redirectsPath(dataDir), JSON.stringify(redirects, null, 2), "utf-8");
}

// ── 인증 데이터 타입 ──
export interface AuthUser {
	id: number;
	email: string;
	passwordHash: string;
	createdAt: string;
}

export interface AuthToken {
	jti: string;
	userId: number;
	type: "session" | "api";
	expiresAt: string | null;
	createdAt: string;
	lastUsedAt: string | null;
}

export interface AuthData {
	nextUserId: number;
	users: AuthUser[];
	tokens: AuthToken[];
}

// ── 인증 데이터 영속화 ──
export async function readAuth(dataDir: string): Promise<AuthData> {
	try {
		const content = await fs.readFile(authPath(dataDir), "utf-8");
		return JSON.parse(content);
	} catch {
		return { nextUserId: 1, users: [], tokens: [] };
	}
}

export async function writeAuth(dataDir: string, data: AuthData): Promise<void> {
	await fs.writeFile(authPath(dataDir), JSON.stringify(data, null, 2), "utf-8");
}