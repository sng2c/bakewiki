import Handlebars from "handlebars";

// CDN version management — edit here in one place
const CDN = {
	pico: "https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css",
	hljs_css: "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github.min.css",
	hljs_js: "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js",
	katex_css: "https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css",
	katex_js: "https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.js",
	katex_auto: "https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/contrib/auto-render.min.js",
	markdownit: "https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js",
};

// Handlebars helpers
Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("json", (v) => JSON.stringify(v));

// Template compile cache (name → compiled function)
const cache = new Map<string, HandlebarsTemplateDelegate>();

const RENDER_SCRIPTS = `
<script src="${CDN.markdownit}"></script>
<script src="${CDN.hljs_js}"></script>
<script src="${CDN.katex_js}"></script>
<script src="${CDN.katex_auto}"></script>`;

const TEMPLATES: Record<string, string> = {
	layout: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}}</title>
<link rel="stylesheet" href="${CDN.pico}">
<link rel="stylesheet" href="${CDN.hljs_css}">
<link rel="stylesheet" href="${CDN.katex_css}">
<style>
main.container { max-width: 800px; }
nav.container-fluid { flex-wrap: wrap; }
textarea[name="content"] { min-height: 320px; font-family: monospace; }
article { padding: 1rem; margin-top: 1rem; }
article > :first-child { margin-top: 0; }
article > :last-child { margin-bottom: 0; }
.page-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem 1rem; margin-bottom:1rem; }
.page-header nav[aria-label="breadcrumb"] { margin:0; padding:0; }
.page-header nav[aria-label="breadcrumb"] ul { margin:0; padding:0; display:flex; flex-wrap:wrap; align-items:center; gap:0.25em 0; font-size:0.8rem; list-style:none; }
.page-header nav[aria-label="breadcrumb"] li { margin:0; padding:0; display:inline-flex; align-items:center; }
.page-header nav[aria-label="breadcrumb"] li + li::before { content:"›"; color:var(--pico-muted-color,#999); margin:0 0.35em; }
.editor-split { display:grid; grid-template-columns:1fr; gap:1rem; }
.editor-split > div { min-width:0; overflow:hidden; }
fieldset { min-width:0; max-width:100%; }
#editor-uploads { overflow:hidden; word-break:break-all; }
.upload-item { overflow:hidden; }
.preview-pane { border:1px solid var(--pico-muted-border-color,#ccc); border-radius:var(--pico-border-radius,0.25rem); padding:1rem; min-height:320px; overflow:auto; background:var(--pico-card-background-color,#f8f8f8); }
</style>
</head>
<body>
<nav class="container-fluid">
<ul>
<li><a href="/"><strong>bakewiki</strong></a></li>
</ul>
<ul>
<li><a href="/pages">Pages</a></li>
<li><a href="/search">Search</a></li>
{{#if user}}
<li><a href="/edit">New</a></li>
<li><a href="/settings">Settings</a></li>
{{else}}
<li><a href="/login">Login</a></li>
{{/if}}
</ul>
</nav>
{{#if needsPageRender}}
${RENDER_SCRIPTS}
{{#if devMode}}<script type="module" src="/@vite/client"></script>
<script type="module" src="/src/client/page.ts"></script>{{else}}<script src="/static/page.js" defer></script>{{/if}}
{{/if}}
<main class="container">
{{{body}}}
</main>
{{#if needsRender}}
${RENDER_SCRIPTS}
{{#if devMode}}<script type="module" src="/@vite/client"></script>
<script type="module" src="/src/client/editor.ts"></script>{{else}}<script src="/static/editor.js" defer></script>{{/if}}
{{/if}}
<script>function copySlug(s){navigator.clipboard.writeText(s).then(function(){event.target.textContent='Copied!';setTimeout(function(){event.target.textContent='Copy slug'},2000)})}</script>
</body>
</html>`,

	page: `<div class="page-header">
<nav aria-label="breadcrumb"><ul>
{{#each breadcrumb}}
<li>{{#if href}}<a href="{{href}}">{{name}}</a>{{else}}{{name}}{{/if}}</li>
{{/each}}
</ul></nav>
<small>{{#if page.isPublic}}public{{else}}<strong>private</strong>{{/if}} · updated {{page.updatedAt}}</small>
</div>
<article id="page-content"></article>
<div id="page-attachments"></div>
<p><small><button type="button" onclick="copySlug('{{slug}}')" class="outline secondary" style="font-size:0.8rem;padding:0.2rem 0.6rem;margin:0">Copy slug</button>{{#if user}} <a href="/edit/{{slug}}" role="button" style="font-size:0.8rem;padding:0.2rem 0.6rem;margin:0">Edit</a>{{/if}}</small></p>
<script id="page-data" type="application/json">{{{pageData}}}</script>`,

	list: `<h1>All pages</h1>
<ul style="list-style:none;padding:0 1rem">
{{#each items}}
<li style="margin-left:calc({{depth}} * 1.5rem)">{{#if isDir}}<a href="/pages/{{dirPath}}">{{name}}</a>{{else}}<a href="/pages/{{slug}}">{{#if title}}{{title}}{{else}}<em style="color:var(--pico-muted-color,#999)">untitled</em>{{/if}}</a> <small style="color:var(--pico-muted-color,#999)">{{slug}}{{#unless isPublic}} 🔒{{/unless}} <button type="button" onclick="copySlug('{{slug}}')" class="outline secondary" style="font-size:0.7rem;padding:0.1rem 0.4rem;margin:0">Copy</button></small>{{/if}}</li>
{{/each}}
</ul>`,

	search: `<h1>Search{{#if q}}: {{q}}{{/if}}</h1>
<form action="/search" method="get">
<input type="search" name="q" value="{{q}}" placeholder="Search pages...">
</form>
{{#if results}}
<ul>
{{#each results}}
<li><a href="/pages/{{slug}}">{{title}}</a><br><small>{{{snippet}}}</small></li>
{{/each}}
</ul>
{{else}}
<p><small>No results.</small></p>
{{/if}}`,

	notFound: `<article>
<h1>Not found</h1>
<p>The page <strong>{{slug}}</strong> does not exist.</p>
{{#if canCreate}}
<a href="/edit/{{slug}}" role="button">Create this page</a>
{{else}}
<p><a href="/login">Login</a> to create it.</p>
{{/if}}
<p><a href="/">Home</a></p>
</article>`,

	login: `<article>
<h1>Login</h1>
<form action="/login" method="post">
<label>Email
<input type="email" name="email" required>
</label>
<label>Password
<input type="password" name="password" required>
</label>
<button type="submit">Login</button>
</form>
{{#if error}}<p><small style="color:red">{{error}}</small></p>{{/if}}
</article>`,

	editor: `<h1>{{#if page}}Edit: {{page.title}}{{else}}New page{{/if}}</h1>
<form action="/edit" method="post">
<input type="hidden" name="originalSlug" value="{{#if page}}{{page.slug}}{{/if}}">
<label>Title
<input type="text" name="title" value="{{title}}">
</label>
<label>Path <small>e.g. tech/web — leave empty for root</small>
<input type="text" name="path" value="{{path}}">
</label>
<label>
<input type="checkbox" name="public" {{#if public}}checked{{/if}}> Public
</label>
<div class="editor-split">
<div>
<label>Content (GFM)
<textarea name="content" id="editor-content">{{body}}</textarea>
</label>
<small>Files: drag/paste into the textarea or <label for="editor-file-input" role="button" class="secondary" style="font-size:0.8rem;padding:0.2rem 0.6rem">choose a file</label></small>
<input type="file" id="editor-file-input" hidden multiple>
<fieldset>
<legend>Uploaded files</legend>
<div id="editor-uploads"></div>
</fieldset>
<div>
<button type="submit">Save</button>
{{#if page}}<a href="/pages/{{page.slug}}" class="secondary">cancel</a>{{/if}}
</div>
</div>
<div>
<label>Preview</label>
<div class="preview-pane" id="editor-preview"></div>
</div>
</div>
</form>`,

	settings: `<article>
<h1>Settings</h1>
<h2>Account</h2>
<p>Email: <strong>{{email}}</strong></p>
<form action="/logout" method="post"><button type="submit" class="outline secondary">Logout</button></form>
<h2>API Key</h2>
{{#if apiKey}}
<div style="display:flex;align-items:center;gap:0.5rem">
<pre style="margin:0;flex:1;overflow-x:auto"><code id="api-key">{{apiKey}}</code></pre>
<button type="button" onclick="copyApiKey()" class="secondary" style="white-space:nowrap">Copy</button>
</div>
<small>Save this key now. It will not be shown again.</small>
<script>function copyApiKey(){var k=document.getElementById('api-key').textContent;navigator.clipboard.writeText(k).then(function(){var b=event.target;b.textContent='Copied!';setTimeout(function(){b.textContent='Copy'},2000)})}</script>
{{else if hasApiKey}}
<p>An API key exists. Regenerate to get a new one.</p>
{{else}}
<p>No API key yet.</p>
{{/if}}
<form action="/settings/api-key" method="post">
<button type="submit">{{#if hasApiKey}}Regenerate{{else}}Generate{{/if}} API Key</button>
</form>
</article>`,
};

// Vite 개발 모드 플래그 (serve.ts에서 설정)
let _devMode = false;
export function setDevMode(dev: boolean): void { _devMode = dev; }

export function renderTemplate(name: string, data: Record<string, unknown>, layoutData?: Record<string, unknown>): string {
	const tmpl = cache.get(name) ?? Handlebars.compile(TEMPLATES[name]);
	if (!cache.has(name)) cache.set(name, tmpl);
	const body = tmpl(data);
	if (layoutData || name === "notFound") {
		const layout = cache.get("layout") ?? Handlebars.compile(TEMPLATES.layout);
		if (!cache.has("layout")) cache.set("layout", layout);
		return layout({ ...layoutData, body, title: layoutData?.title ?? name, devMode: _devMode });
	}
	return body;
}