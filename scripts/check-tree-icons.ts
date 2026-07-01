import { chromium } from "playwright";

async function main() {
	const b = await chromium.launch();
	const p = await b.newPage();
	await p.goto("http://127.0.0.1:3000/pages", { waitUntil: "networkidle" });
	await p.waitForTimeout(2000);
	await p.screenshot({ path: "/root/bakewiki/screenshots/pages-tree.png", fullPage: true });

	// 각 아이콘의 렌더링 상태 확인
	const data = await p.evaluate(() => {
		const icons = document.querySelectorAll(".page-tree [data-lucide], .page-tree svg");
		return Array.from(icons).map((el) => {
			const tag = el.tagName.toLowerCase();
			const box = el.getBoundingClientRect();
			return {
				tag,
				lucide: el.getAttribute("data-lucide"),
				rendered: tag === "svg",
				size: `${Math.round(box.width)}x${Math.round(box.height)}`,
				visible: box.width > 0 && box.height > 0,
			};
		});
	});
	console.log("아이콘 상태:");
	data.forEach((d, i) => console.log(`  ${i}: ${JSON.stringify(d)}`));

	await b.close();
}
main();
