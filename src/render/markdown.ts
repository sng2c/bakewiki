import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import katexPlugin from "@vscode/markdown-it-katex";

// GFM + 코드 하이라이트 + KaTeX. SSR에서 HTML로 렌더링.
const md: MarkdownIt = new MarkdownIt({
	html: true, // 관리자 신뢰 (SPEC: Sanitize 생략)
	linkify: true,
	typographer: false,
	highlight(str: string, lang: string): string {
		if (lang && hljs.getLanguage(lang)) {
			try {
				return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
			} catch {
				// fall through
			}
		}
		return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
	},
});

// KaTeX 수식 플러그인 ($...$, $$...$$)
md.use(katexPlugin.default ?? katexPlugin);

// GFM 추가: 테이블, 스트라이크스루 (markdown-it는 기본 지원하지만 명시)
md.set({ breaks: false });

// 현재 렌더링 컨텍스트의 슬러그 (상대 링크 해석용)
let renderSlug = "";

// 상대 경로 해석: 슬러그 기준으로 ./, ../, 일반 상대경로 처리
// 예: slug="index", href="hehe" → "index/hehe"
//     slug="tech/web/http", href="../css" → "tech/web/css"
function resolveRelative(slug: string, href: string): string {
	const parts = [...slug.split("/"), ...href.split("/")];
	const resolved: string[] = [];
	for (const part of parts) {
		if (part === "..") {
			if (resolved.length > 0) resolved.pop();
		} else if (part !== "." && part !== "") {
			resolved.push(part);
		}
	}
	return resolved.join("/");
}

// 링크 URL 정규화:
// - 절대 경로 (/...) → /pages 접두사
// - 상대 경로 → 슬러그 기준 해석 후 /pages 접두사
// - 외부 URL, 앵커, 프로토콜 상대 (//) → 그대로
const defaultNormalizeLink = md.normalizeLink.bind(md);
md.normalizeLink = (url: string) => {
	// 절대 경로: /foo → /pages/foo
	if (url.startsWith("/") && !url.startsWith("//")) {
		return defaultNormalizeLink("/pages" + url);
	}
	// 앵커: #section → 그대로
	if (url.startsWith("#")) {
		return defaultNormalizeLink(url);
	}
	// 스키마 포함 (http:, https:, mailto: 등) → 그대로
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
		return defaultNormalizeLink(url);
	}
	// 상대 경로: 슬러그 기준 해석
	if (renderSlug) {
		const resolved = resolveRelative(renderSlug, url);
		return defaultNormalizeLink("/pages/" + resolved);
	}
	return defaultNormalizeLink(url);
};

// frontmatter 제거된 본문(body) → HTML
// slug: 상대 링크 해석 기준 (옵션)
export function renderMarkdown(body: string, slug?: string): string {
	renderSlug = slug ?? "";
	return md.render(body);
}