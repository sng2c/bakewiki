import readline from "node:readline";
import { stdin, stdout } from "node:process";
import crypto from "node:crypto";
import { resolveDataDir, initDataDir, readAuth, writeAuth, readConfig, writeConfig } from "../data.js";
import { hashPassword } from "../auth/password.js";
import { setJwtSecret } from "../auth/jwt.js";

// TTY/파이프 모두 동작하는 한 줄 읽기.
function ask(prompt: string): Promise<string> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({ input: stdin, output: stdout });
		rl.question(prompt, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

// 관리자 계정 생성.
export async function adminCreateCommand(dataDir?: string): Promise<void> {
	const dir = resolveDataDir(dataDir);
	await initDataDir(dir);

	// 설정 로드 (없으면 자동 생성 + 영속화)
	const config = await readConfig(dir);
	if (!config.jwtSecret) {
		config.jwtSecret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
	}
	await writeConfig(dir, config);
	setJwtSecret(config.jwtSecret);

	const auth = await readAuth(dir);

	// non-TTY(파이프/CI) 폴백: 환경변수에서 관리자 자격증명 읽기
	let email: string;
	let password: string;
	if (process.stdin.isTTY) {
		email = await ask("Admin email: ");
		if (!email || !email.includes("@")) {
			console.error("Invalid email.");
			process.exit(1);
		}
		password = await ask("Admin password: ");
		if (!password) {
			console.error("Empty password.");
			process.exit(1);
		}
	} else {
		email = process.env.BAKEWIKI_ADMIN_EMAIL ?? "";
		password = process.env.BAKEWIKI_ADMIN_PASSWORD ?? "";
		if (!email || !password) {
			console.error("Non-interactive mode requires BAKEWIKI_ADMIN_EMAIL and BAKEWIKI_ADMIN_PASSWORD.");
			process.exit(1);
		}
		console.log(`Admin email: ${email}`);
	}

	// 관리자가 이미 존재하면 스킵
	const existing = auth.users.find((u) => u.email === email);
	if (existing) {
		console.log(`Admin already exists: ${email}. (skipped)`);
		return;
	}

	// 관리자 생성
	const passwordHash = await hashPassword(password);
	const id = auth.nextUserId++;
	auth.users.push({ id, email, passwordHash, createdAt: new Date().toISOString() });

	await writeAuth(dir, auth);

	console.log(`Admin created: ${email}`);
	console.log("Run `bakewiki serve --data <path>` to start, then log in to see your API key at /settings.");
}