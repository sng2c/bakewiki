import { chromium } from "playwright";

async function main() {
	const b = await chromium.launch();
	const p = await b.newPage();
	const errors: string[] = [];
	p.on("pageerror", (e) => errors.push(e.message));
	p.on("console", (m) => {
		if (m.type() === "error") errors.push("CONSOLE: " + m.text());
	});
	await p.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
	await p.waitForTimeout(2000);

	const copyBtn = await p.locator(".copy-slug-btn").count();
	const copySvg = await p.locator(".copy-slug-btn svg").count();
	const breadcrumbText = (await p.locator('nav[aria-label="breadcrumb"]').textContent())?.trim();

	console.log("copy-slug-btn 수:", copyBtn);
	console.log("copy svg 렌더링됨:", copySvg > 0);
	console.log("breadcrumb:", breadcrumbText);

	// 렌더링된 아이콘 HTML 확인
	const iconHtml = await p.locator(".copy-slug-btn").innerHTML();
	console.log("아이콘 HTML:", iconHtml.slice(0, 100));

	if (errors.length) {
		console.log("\n에러:", errors);
	} else {
		console.log("\n에러 없음 ✓");
	}
	await b.close();
}
main();
