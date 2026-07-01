import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3000";

async function main() {
	const browser = await chromium.launch();
	const page = await browser.newPage();

	const failed: string[] = [];
	page.on("response", (resp) => {
		if (resp.status() >= 400) {
			failed.push(`${resp.status()} ${resp.url()}`);
		}
	});

	await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
	await page.waitForTimeout(2000);

	console.log("실패한 요청:");
	failed.forEach((f) => console.log("  " + f));

	await browser.close();
}

main().catch(console.error);
