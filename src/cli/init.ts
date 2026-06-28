import readline from "node:readline";
import { stdin, stdout } from "node:process";
import os from "node:os";
import path from "node:path";
import { initDb } from "../db/index.js";
import { runMigrations } from "../migrate.js";
import { seedAdmin } from "../auth/seed.js";

// TTY/파이프 모두 동작하는 한 줄 읽기. readline/promises는 non-TTY에서 불안정.
function ask(prompt: string): Promise<string> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({ input: stdin, output: stdout });
		rl.question(prompt, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

// 프로젝트 초기화: DB 생성 + 마이그레이션 + 인터랙티브 관리자 계정 생성.
export async function initCommand(): Promise<void> {
	const dbPath = process.env.BAKEWIKI_DB_PATH ?? path.join(os.homedir(), ".bakewiki", "data", "bakewiki.db");
	console.log(`DB path: ${dbPath}`);

	const db = initDb();
	runMigrations(db);
	console.log("Database initialized.");

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

	const result = await seedAdmin(db, email, password);
	if (result.created) {
		console.log(`Admin created: ${email}`);
		console.log(`API key (save now, shown once): ${result.apiKey}`);
	} else {
		console.log(`Admin already exists: ${email}. (skipped)`);
	}

	console.log("Done. Run `bakewiki serve` to start.");
}
