// bakewiki page rendering. Loaded from layout.hbs when needsPageRender is set.
// CDN deps: markdown-it, highlight.js, KaTeX.
(function () {
	var raw = document.getElementById('page-data');
	if (!raw) return;
	var d = JSON.parse(raw.textContent);
	var el = document.getElementById('page-content');
	if (!el) return;

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

	// Slug → upload directory path (strip leading/trailing /, keep internal /)
	function slugToUploadDir(slug) {
		if (!slug) return '_';
		return slug.replace(/^\/+|\/+$/g, '');
	}

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

	// Link resolution: standard URL — relative links resolve against parent directory.
	// Slug = "tech/web/http" → base = "tech/web" (parent directory).
	var defaultNormalizeLink = md.normalizeLink.bind(md);
	md.normalizeLink = function (url) {
		// @@<file> marker → upload reference, resolve with current slug
		if (url.startsWith('@@') && d.slug) {
			var ufile = url.slice(2);
			return defaultNormalizeLink('/uploads/' + slugToUploadDir(d.slug) + '/' + ufile);
		}
		if (url.startsWith('/uploads/')) return defaultNormalizeLink(url);
		if (url.startsWith('/') && !url.startsWith('//')) return defaultNormalizeLink('/pages' + url);
		if (url.startsWith('#')) return defaultNormalizeLink(url);
		if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return defaultNormalizeLink(url);
		// Relative URL: resolve against parent directory of current slug
		var base = d.slug;
		if (base) {
			var slashIdx = base.lastIndexOf('/');
			var dir = slashIdx >= 0 ? base.substring(0, slashIdx) : '';
			var parts = (dir ? dir.split('/') : []).concat(url.split('/'));
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
			for (var i = 0; i < data.files.length; i++) {
				var f = data.files[i];
				var li = document.createElement('li');
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