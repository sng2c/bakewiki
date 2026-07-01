import { chromium } from "playwright";

async function main() {
	const b = await chromium.launch();
	const p = await b.newPage();
	await p.goto("http://127.0.0.1:3000/pages", { waitUntil: "networkidle" });
	await p.waitForTimeout(1500);
	await p.screenshot({ path: "/root/bakewiki/screenshots/pages-tree.png" });

	// list 요소의 computed style
	const data = await p.evaluate(() => {
		const ul = document.querySelector("ul.page-tree") as HTMLUListElement | null;
		if (!ul) return "no tree";
		const ulStyle = getComputedStyle(ul);
		const firstLi = ul.querySelector("li") as HTMLLIElement | null;
		const liStyle = firstLi ? getComputedStyle(firstLi) : null;
		return {
			ul: { padding: ulStyle.padding, margin: ulStyle.margin, listStyle: ulStyle.listStyle, paddingLeft: ulStyle.paddingLeft },
			li: liStyle ? { padding: liStyle.padding, margin: liStyle.margin, listStyle: liStyle.listStyle } : null,
		};
	});
	console.log(JSON.stringify(data, null, 2));

	await b.close();
}
main();
