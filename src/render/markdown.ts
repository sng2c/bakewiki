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

// frontmatter 제거된 본문(body) → HTML
export function renderMarkdown(body: string): string {
	return md.render(body);
}
