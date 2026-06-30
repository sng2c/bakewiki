// bakewiki editor. Loaded from editor.hbs.
// Live preview + image upload (drag/paste/select) → list → insert/delete buttons.
// CDN deps: markdown-it, highlight.js, KaTeX.
(function () {
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

	var slugInput = document.querySelector('input[name=slug]');
	var ta = document.getElementById('editor-content');
	var pv = document.getElementById('editor-preview');
	var titleInput = document.querySelector('input[name=title]');
	var listEl = document.getElementById('editor-uploads');
	var timer;

	if (!ta || !pv) return;

	// Link resolution: absolute /uploads,/pages; relative resolved against slug input
	var defaultNormalizeLink = md.normalizeLink.bind(md);
	md.normalizeLink = function (url) {
		if (url.startsWith('/uploads/')) return defaultNormalizeLink(url);
		if (url.startsWith('/') && !url.startsWith('//')) return defaultNormalizeLink('/pages' + url);
		if (url.startsWith('#')) return defaultNormalizeLink(url);
		if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return defaultNormalizeLink(url);
		var base = slugInput ? slugInput.value : '';
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

	function update() {
		var t = titleInput ? titleInput.value : '';
		var c = '# ' + t + '\n\n' + ta.value;
		pv.innerHTML = md.render(c);
		if (window.renderMathInElement) {
			renderMathInElement(pv, {
				delimiters: [
					{ left: '$$', right: '$$', display: true },
					{ left: '$', right: '$', display: false },
					{ left: '\\(', right: '\\)', display: false },
					{ left: '\\[', right: '\\]', display: true }
				]
			});
		}
	}
	function debounce() { clearTimeout(timer); timer = setTimeout(update, 400); }

	ta.addEventListener('input', debounce);
	if (titleInput) titleInput.addEventListener('input', debounce);
	update();

	// ── Insert text at cursor ──
	function insertAtCursor(text) {
		var s = ta.selectionStart, e = ta.selectionEnd;
		ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
		ta.selectionStart = ta.selectionEnd = s + text.length;
		ta.dispatchEvent(new Event('input'));
		ta.focus();
	}

	// ── Upload API ──
	async function uploadImage(file) {
		var fd = new FormData();
		fd.append('file', file);
		fd.append('slug', slugInput ? slugInput.value : '');
		var r = await fetch('/api/upload', { method: 'POST', body: fd });
		if (!r.ok) {
			var j = await r.json().catch(function () {});
			alert('Upload failed: ' + ((j && j.error) || r.status));
			return null;
		}
		return await r.json();
	}

	async function deleteImage(filename) {
		var r = await fetch('/api/upload/' + encodeURIComponent(filename), { method: 'DELETE' });
		if (!r.ok) {
			var j = await r.json().catch(function () {});
			alert('Delete failed: ' + ((j && j.error) || r.status));
			return false;
		}
		return true;
	}

	// ── Append an upload list item ──
	function appendUpload(item) {
		if (!listEl) return;
		var row = document.createElement('div');
		row.className = 'upload-item';
		row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid var(--pico-muted-border-color,#eee)';

		var isImage = item.ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].indexOf(item.ext) !== -1;
		var preview;
		if (isImage) {
			preview = document.createElement('img');
			preview.src = item.url;
			preview.alt = '';
			preview.style.cssText = 'max-height:48px;max-width:48px;object-fit:cover;border-radius:4px';
		} else {
			preview = document.createElement('span');
			preview.textContent = '📄';
			preview.style.cssText = 'font-size:32px;width:48px;height:48px;display:flex;align-items:center;justify-content:center';
		}
		preview.style.cursor = 'pointer';
		preview.title = 'Click to insert';

		var name = document.createElement('small');
		name.textContent = item.original;
		name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

		var insertBtn = document.createElement('button');
		insertBtn.type = 'button';
		insertBtn.textContent = 'Insert';
		insertBtn.className = 'secondary';
		insertBtn.style.cssText = 'font-size:0.8rem;padding:0.2rem 0.6rem;margin:0';

		var delBtn = document.createElement('button');
		delBtn.type = 'button';
		delBtn.textContent = 'Delete';
		delBtn.className = 'secondary';
		delBtn.style.cssText = 'font-size:0.8rem;padding:0.2rem 0.6rem;margin:0;color:#c0392b';
		delBtn.addEventListener('click', async function () {
			if (!confirm('Delete this file? ' + item.original)) return;
			var ok = await deleteImage(item.filename);
			if (ok) row.remove();
		});

		function doInsert() {
			var md = isImage ? '\n![](' + item.url + ')\n' : '\n[' + item.original + '](' + item.url + ')\n';
			insertAtCursor(md);
		}
		preview.addEventListener('click', doInsert);
		insertBtn.addEventListener('click', doInsert);

		row.appendChild(preview);
		row.appendChild(name);
		row.appendChild(insertBtn);
		row.appendChild(delBtn);
		listEl.appendChild(row);
	}

	async function handleFiles(files) {
		if (!files || !files.length) return;
		for (var i = 0; i < files.length; i++) {
			var f = files[i];
			if (!f.size) continue;
			var item = await uploadImage(f);
			if (item) appendUpload(item);
		}
	}

	var fi = document.getElementById('editor-file-input');
	if (fi) fi.addEventListener('change', function () { handleFiles(fi.files); fi.value = ''; });
	ta.addEventListener('dragover', function (e) { e.preventDefault(); });
	ta.addEventListener('drop', function (e) { e.preventDefault(); handleFiles(e.dataTransfer.files); });
	ta.addEventListener('paste', function (e) {
		var items = e.clipboardData && e.clipboardData.items;
		if (!items) return;
		for (var i = 0; i < items.length; i++) {
			if (items[i].kind === 'file') {
				var f = items[i].getAsFile();
				if (f) handleFiles([f]);
			}
		}
	});

	// ── Load existing uploads ──
	if (listEl) {
		fetch('/api/upload').then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
			if (data && data.files) {
				for (var i = 0; i < data.files.length; i++) appendUpload(data.files[i]);
			}
		}).catch(function () {});
	}
})();
