import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// ── 데이터 디렉토리 해석 ──
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

// 정적 자산(JS) 디렉토리 해석.
export function publicDir(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	let dir = here;
	for (let i = 0; i < 5; i++) {
		const candidate = path.join(dir, "public");
		if (fsSync.existsSync(candidate)) return candidate;
		dir = path.dirname(dir);
	}
	return path.join(here, "..", "public");
}

export function authPath(dataDir: string): string {
	return path.join(dataDir, "auth.json");
}

export function configPath(dataDir: string): string {
	return path.join(dataDir, "config.yml");
}

export function pageDir(dataDir: string, slug: string): string {
	return path.join(pagesDir(dataDir), slug);
}

export function indexPath(dataDir: string, slug: string): string {
	return path.join(pageDir(dataDir, slug), "index.md");
}

export function metaPath(dataDir: string, slug: string): string {
	return path.join(pageDir(dataDir, slug), "meta.yml");
}

export async function initDataDir(dataDir: string): Promise<void> {
	await fs.mkdir(pagesDir(dataDir), { recursive: true });
}

// ── 설정 (config.yml) ──
export interface Config {
	jwtSecret: string;
	homeSlug: string;
}

const DEFAULT_CONFIG: Config = {
	jwtSecret: "",
	homeSlug: "home",
};

export async function readConfig(dataDir: string): Promise<Config> {
	try {
		const content = await fs.readFile(configPath(dataDir), "utf-8");
		const parsed = parseYaml(content);
		if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CONFIG, jwtSecret: generateSecret() };
		return {
			jwtSecret: typeof parsed.jwtSecret === "string" && parsed.jwtSecret ? parsed.jwtSecret : generateSecret(),
			homeSlug: typeof parsed.homeSlug === "string" && parsed.homeSlug ? parsed.homeSlug : "home",
		};
	} catch {
		return { ...DEFAULT_CONFIG, jwtSecret: generateSecret() };
	}
}

export async function writeConfig(dataDir: string, config: Config): Promise<void> {
	const lines = [
		`# bakewiki 설정`,
		`# 자동 생성됨 — 직접 수정 가능`,
		`jwtSecret: "${config.jwtSecret}"`,
		`homeSlug: "${config.homeSlug}"`,
		``,
	];
	await fs.writeFile(configPath(dataDir), lines.join("\n"), "utf-8");
}

function generateSecret(): string {
	return crypto.randomBytes(32).toString("hex");
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