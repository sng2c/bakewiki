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

	// Link resolution: absolute /uploads,/pages; relative resolved against page slug
	var defaultNormalizeLink = md.normalizeLink.bind(md);
	md.normalizeLink = function (url) {
		if (url.startsWith('/uploads/')) return defaultNormalizeLink(url);
		if (url.startsWith('/') && !url.startsWith('//')) return defaultNormalizeLink('/pages' + url);
		if (url.startsWith('#')) return defaultNormalizeLink(url);
		if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return defaultNormalizeLink(url);
		var base = d.slug;
		if (base) {
			var parts = base.split('/').concat(url.split('/'));
			var resolved = [];
			for (var i = 0; i < parts.length; i++) {
				if (parts[i] === '..') { if (resolved.length > 0) resolved.pop(); }
				else if (parts[i] !== '.' && parts[i] !== '') resolved.push(parts[i]);
			}
			return defaultNormalizeLink('/pages' + resolved.join('/'));
		}
		return defaultNormalizeLink(url);
	};

	// Render heading: dimmed 'untitled' placeholder if the page has no title.
	var heading = d.title ? md.render('# ' + d.title) : '<h1><em style="color:var(--pico-muted-color,#999)">untitled</em></h1>';
	el.innerHTML = heading + md.render(d.body);

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
