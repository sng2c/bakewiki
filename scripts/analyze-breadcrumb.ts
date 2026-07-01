import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3000";

async function analyze(url: string, label: string) {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.goto(url, { waitUntil: "networkidle" });
	await page.waitForTimeout(1000);

	console.log(`\n=== ${label} ===`);
	console.log(`URL: ${url}`);

	// breadcrumb 컨테이너 박스
	const data = await page.evaluate(() => {
		const ul = document.querySelector('nav[aria-label="breadcrumb"] ul') as HTMLUListElement | null;
		if (!ul) return null;
		const ulBox = ul.getBoundingClientRect();
		const result = {
			ul: { x: ulBox.x, y: ulBox.y, w: Math.round(ulBox.width), h: Math.round(ulBox.height) },
			items: [] as Array<{text: string; before: string; x: number; y: number; w: number; h: number; fontSize: string; display: string}>,
		};
		for (const li of Array.from(ul.children)) {
			const box = li.getBoundingClientRect();
			const before = window.getComputedStyle(li, "::before");
			result.items.push({
				text: li.textContent?.trim() || "",
				before: before.content,
				x: Math.round(box.x),
				y: Math.round(box.y),
				w: Math.round(box.width),
				h: Math.round(box.height),
				fontSize: window.getComputedStyle(li).fontSize,
				display: window.getComputedStyle(li).display,
			});
		}
		return result;
	});

	if (!data) {
		console.log("breadcrumb 없음");
		await browser.close();
		return;
	}

	console.log(`\nUL 박스: x=${data.ul.x} y=${data.ul.y} w=${data.ul.w} h=${data.ul.h}`);
	console.log(`\n항목별 위치:`);
	for (const item of data.items) {
		console.log(`  "${item.text}" before=${item.before} x=${item.x} w=${item.w} (오른쪽 끝=${item.x + item.w}) fontSize=${item.fontSize} display=${item.display}`);
	}

	// 겹침 검사
	console.log(`\n겹침 검사:`);
	let overlap = false;
	for (let i = 1; i < data.items.length; i++) {
		const prev = data.items[i - 1];
		const curr = data.items[i];
		const gap = curr.x - (prev.x + prev.w);
		if (gap < 0) {
			console.log(`  ⚠️ 겹침: "${prev.text}" 와 "${curr.text}" — ${gap}px 겹침`);
			overlap = true;
		} else {
			console.log(`  ✅ "${prev.text}" → "${curr.text}" 간격 ${gap}px`);
		}
	}
	if (!overlap) console.log("  겹침 없음");

	await browser.close();
}

async function main() {
	await analyze(`${BASE}/`, "홈페이지");
	await analyze(`${BASE}/pages/tech/web/HTTPS`, "중첩 페이지");
}

main().catch((e) => { console.error(e); process.exit(1); });
