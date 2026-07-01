// bakewiki page rendering. Loaded from layout.hbs when needsPageRender is set.
// CDN deps: markdown-it, highlight.js, KaTeX.

// Vite HMR (dev mode only, no-op in production)
if (import.meta.hot) {
	import.meta.hot.accept();
}

(function () {
	var el = document.getElementById('page-content');
	if (!el) return;
	// 원문은 SSR로 <article>에 이스케이프된 텍스트로 들어있음.
	// textContent로 읽어 마크다운 렌더링 후 HTML로 교체.
	var d = { body: el.textContent, slug: el.getAttribute('data-slug') || '' };

	var md = window.markdownit({
		html: true,
		linkify: true,
		typographer: false,
		highlight: function (str, lang) {
			if (lang && window.hljs && hljs.getLanguage(lang)) {
				try {
					return '<pre class="hljs"><code>' + hljs.highlight(str, { language: lang }).value + '</code></pre>';
				} catch (e) {}
			}
			return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
		}
	});


	// Resolve a wiki-link target to a URL. Absolute slug only.
	function resolveWikiLink(target) {
		return '/pages/' + target;
	}

	// Wiki-link rule: [[target]] or [[target|display]]
	md.inline.ruler.before('link', 'wikilink', function (state, silent) {
		var src = state.src.slice(state.pos);
		var match = src.match(/^\[\[([^\]]+)\]\]/);
		if (!match) return false;
		if (!silent) {
			var parts = match[1].split('|');
			var target = parts[0].trim();
			var display = parts.length > 1 ? parts[1].trim() : target;
			var url = resolveWikiLink(target);
			var token = state.push('link_open', 'a', 1);
			token.attrs = [['href', url]];
			token = state.push('text', '', 0);
			token.content = display;
			state.push('link_close', 'a', -1);
		}
		state.pos += match[0].length;
		return true;
	});

	// Link resolution: standard URL — relative links resolve against parent path.
	// Slug = "tech/web/http" → path = "tech/web" (parent path).
	var defaultNormalizeLink = md.normalizeLink.bind(md);
	md.normalizeLink = function (url) {
		// 절대 경로: /pages/... 위키 경로는 그대로
		if (url.startsWith('/pages/')) return defaultNormalizeLink(url);
		// 앱 라우트: /login, /edit, /auth, /search, /
		if (url === '/' || url.startsWith('/login') || url.startsWith('/edit') || url.startsWith('/auth') || url.startsWith('/search')) return defaultNormalizeLink(url);
		// 레거시 /uploads/ → /pages/
		if (url.startsWith('/uploads/')) return defaultNormalizeLink(url.replace('/uploads/', '/pages/'));
		// 다른 /path는 위키 절대 경로
		if (url.startsWith('/') && !url.startsWith('//')) return defaultNormalizeLink('/pages' + url);
		// 앵커
		if (url.startsWith('#')) return defaultNormalizeLink(url);
		// 외부 URL (http:, https:, mailto: 등)
		if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return defaultNormalizeLink(url);
		// 상대 경로: 현재 slug 디렉토리 기준으로 해석
		// ![](photo.jpg) → /pages/tech/web/HTTPS/photo.jpg
		var base = d.slug;
		if (base) {
			var parts = base.split('/').concat(url.split('/'));
			var resolved = [];
			for (var i = 0; i < parts.length; i++) {
				if (parts[i] === '..') { if (resolved.length > 0) resolved.pop(); }
				else if (parts[i] !== '.' && parts[i] !== '') resolved.push(parts[i]);
			}
			return defaultNormalizeLink('/pages/' + resolved.join('/'));
		}
		return defaultNormalizeLink(url);
	};

	// Render body directly — title comes from first # heading in body.
	el.innerHTML = md.render(d.body);

	if (window.renderMathInElement) {
		renderMathInElement(el, {
			delimiters: [
				{ left: '$$', right: '$$', display: true },
				{ left: '$', right: '$', display: false },
				{ left: '\\(', right: '\\)', display: false },
				{ left: '\\[', right: '\\]', display: true }
			]
		});
	}

	// ── Attachments section ──
	renderAttachments(d.slug);
})();

// Fetch this page's uploads (/api/upload/by-slug/:slug) and render an attachments section.
function renderAttachments(slug) {
	if (!slug) return;
	var container = document.getElementById('page-attachments');
	if (!container) return;
	fetch('/api/upload/by-slug/' + encodeURIComponent(slug))
		.then(function (r) { return r.ok ? r.json() : null; })
		.then(function (data) {
			if (!data || !data.files || !data.files.length) return;
			var IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
			var h2 = document.createElement('h2');
			h2.textContent = 'Attachments';
			h2.style.cssText = 'font-size:1em;color:var(--pico-muted-color,#999);margin-bottom:0.5rem';
			container.appendChild(h2);
			var list = document.createElement('ul');
			list.style.cssText = 'list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:0.4rem;';
			for (var i = 0; i < data.files.length; i++) {
				var f = data.files[i];
				var li = document.createElement('li');
				li.style.cssText = 'display:flex;align-items:center;gap:0.5rem;min-height:2em;margin:0;';
				var dot = document.createElement('span');
				dot.textContent = '•';
				dot.style.cssText = 'color:var(--pico-muted-color,#999);flex:0 0 auto;line-height:1;';
				li.appendChild(dot);
				var isImage = f.ext && IMAGE_EXT.indexOf(f.ext) !== -1;
				if (isImage) {
					var a = document.createElement('a');
					a.href = f.url;
					a.target = '_blank';
					a.rel = 'noopener';
					a.style.cssText = 'display:flex;align-items:center;gap:0.5rem';
					var img = document.createElement('img');
					img.src = f.url;
					img.alt = f.original;
					img.style.cssText = 'width:2em;height:2em;object-fit:cover;border-radius:4px;flex:0 0 auto';
					a.appendChild(img);
					var name = document.createElement('span');
					name.textContent = f.original;
					name.style.cssText = 'flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
					a.appendChild(name);
					li.appendChild(a);
				} else {
					var link = document.createElement('a');
					link.href = f.url;
					link.target = '_blank';
					link.rel = 'noopener';
					link.textContent = f.original;
					link.style.cssText = 'display:inline-block;max-width:70ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
					li.appendChild(link);
				}
				list.appendChild(li);
			}
			container.appendChild(list);
		})
		.catch(function () {});
}