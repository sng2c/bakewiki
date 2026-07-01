import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3000";

async function main() {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.goto(`${BASE}/pages/tech/web/HTTPS`, { waitUntil: "networkidle" });
	
	const analysis = await page.evaluate(() => {
		const ul = document.querySelector('nav[aria-label="breadcrumb"] ul');
		if (!ul) return "UL 없음";
		
		const items = Array.from(ul.children);
		const results = [];
		
		for (let i = 0; i < items.length; i++) {
			const li = items[i];
			const style = window.getComputedStyle(li);
			const box = li.getBoundingClientRect();
			const before = window.getComputedStyle(li, "::before");
			
			results.push({
				tag: li.tagName,
				text: li.textContent?.trim(),
				x: box.x,
				w: box.width,
				margin: style.margin,
				padding: style.padding,
				display: style.display,
				beforeWidth: before.width,
				beforeMargin: before.margin,
				beforePadding: before.padding
			});
		}
		return results;
	});

	console.log("Detailed Spacing Analysis:");
	analysis.forEach((item, i) => {
		console.log(`${i}: [${item.text}] x=${item.x.toFixed(1)} w=${item.w.toFixed(1)} display=${item.display}`);
		console.log(`   li style: margin=${item.margin}, padding=${item.padding}`);
		console.log(`   ::before: w=${item.beforeWidth} margin=${item.beforeMargin} padding=${item.beforePadding}`);
		if (i > 0) {
			const prev = analysis[i-1];
			const gap = item.x - (prev.x + prev.w);
			console.log(`   >>> GAP from previous: ${gap.toFixed(1)}px`);
		}
	});

	await browser.close();
}

main().catch(console.error);
