import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3000";

async function check(url: string, label: string) {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const errors: string[] = [];
	const consoleMsgs: string[] = [];

	page.on("pageerror", (e) => errors.push(`PAGE ERROR: ${e.message}`));
	page.on("console", (msg) => {
		if (msg.type() === "error") consoleMsgs.push(`CONSOLE ERROR: ${msg.text()}`);
		if (msg.type() === "warning") consoleMsgs.push(`CONSOLE WARN: ${msg.text()}`);
	});

	const resp = await page.goto(url, { waitUntil: "networkidle" });
	console.log(`\n=== ${label} ===`);
	console.log(`URL: ${url}`);
	console.log(`Status: ${resp?.status()}`);

	await page.waitForTimeout(2000);

	if (errors.length) {
		console.log("\n페이지 에러:");
		errors.forEach((e) => console.log("  " + e));
	}
	if (consoleMsgs.length) {
		console.log("\n콘솔 메시지:");
		consoleMsgs.forEach((m) => console.log("  " + m));
	}
	if (!errors.length && !consoleMsgs.length) {
		console.log("에러 없음 ✓");
	}

	await browser.close();
}

async function main() {
	await check(`${BASE}/`, "홈페이지");
	await check(`${BASE}/pages/tech/web/HTTPS`, "중첩 페이지");
	await check(`${BASE}/edit/index`, "편집 페이지");
}

main().catch((e) => { console.error(e); process.exit(1); });
