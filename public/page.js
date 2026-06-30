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

	el.innerHTML = md.render('# ' + d.title + '\n\n' + d.body);

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
			container.appendChild(h2);
			var list = document.createElement('ul');
			for (var i = 0; i < data.files.length; i++) {
				var f = data.files[i];
				var li = document.createElement('li');
				var isImage = f.ext && IMAGE_EXT.indexOf(f.ext) !== -1;
				if (isImage) {
					var img = document.createElement('img');
					img.src = f.url;
					img.alt = f.filename;
					img.style.maxWidth = '100%';
					li.appendChild(img);
				} else {
					var a = document.createElement('a');
					a.href = f.url;
					a.textContent = f.filename;
					li.appendChild(a);
				}
				list.appendChild(li);
			}
			container.appendChild(list);
		})
		.catch(function () {});
}
