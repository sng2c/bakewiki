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

// 재귀 트리 노드 partial — 모든 노드를 li로 출력.
// 실제 페이지: file-text 아이콘 + 제목 / 빈 페이지: file 아이콘 + 회색 / private: lock 아이콘
Handlebars.registerPartial("treeNode", `{{#each children}}<li class="tree-node"><a href="/pages/{{#if isEmpty}}{{dirPath}}{{else}}{{slug}}{{/if}}" class="{{#if isEmpty}}empty{{/if}}">{{#if isEmpty}}<i data-lucide="file" class="tree-icon"></i>{{else}}{{#if isPublic}}<i data-lucide="file-text" class="tree-icon"></i>{{else}}<i data-lucide="lock" class="tree-icon tree-lock" title="private"></i>{{/if}}{{/if}} {{#if isEmpty}}{{name}}{{else}}{{#if title}}{{title}}{{else}}{{name}}{{/if}}{{/if}}</a> <span class="copy-slug-btn" title="Copy slug" onclick="copySlug('{{#if isEmpty}}{{dirPath}}{{else}}{{slug}}{{/if}}',this)"><i data-lucide="copy" class="tree-icon"></i></span>{{#if children.length}}<ul>{{> treeNode children=children}}</ul>{{/if}}</li>{{/each}}`);

// Template compile cache (name → compiled function)
const cache = new Map<string, HandlebarsTemplateDelegate>();

const RENDER_SCRIPTS = `
<script src="${CDN.markdownit}"></script>
<script src="${CDN.hljs_js}"></script>
<script src="${CDN.katex_js}"></script>
<script src="${CDN.katex_auto}"></script>`;

// Lucide 아이콘 — 모든 페이지에서 사용되므로 layout 헤더에 항상 로드.
const LUCIDE_SCRIPT = `<script src="https://unpkg.com/lucide@latest"></script>`;

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
${LUCIDE_SCRIPT}
<style>
main.container { max-width: 800px; }
nav.container-fluid { flex-wrap: wrap; }
textarea[name="content"] { min-height: 320px; font-family: monospace; }
article { padding: 1rem; margin-top: 1rem; }
article > :first-child { margin-top: 0; }
article > :last-child { margin-bottom: 0; }
.page-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem 1rem; margin-bottom:1rem; }
.page-header nav[aria-label="breadcrumb"] { margin:0; padding:0; }
.page-header nav[aria-label="breadcrumb"] ul { margin:0; padding:0; display:flex; flex-wrap:wrap; align-items:center; gap:0; font-size:0.8rem; list-style:none; }
.page-header nav[aria-label="breadcrumb"] li { margin:0!important; padding:0!important; display:flex; align-items:center; }
.page-header nav[aria-label="breadcrumb"] li + li { margin-left:0!important; }
.page-header nav[aria-label="breadcrumb"] li a { padding:0!important; margin:0!important; text-decoration:none; display:flex; align-items:center; }
.page-header nav[aria-label="breadcrumb"] li::before,
.page-header nav[aria-label="breadcrumb"] li::after { content:none!important; }
.page-header nav[aria-label="breadcrumb"] li + li::before { content:"/"!important; color:var(--pico-muted-color,#999); margin:0 3px!important; padding:0!important; display:inline-block; }
.page-meta { display:inline-flex; align-items:center; gap:0.3rem; font-size:0.75rem; color:var(--pico-muted-color,#999); }
.page-header-left { display:inline-flex; align-items:center; gap:0.35rem; flex-wrap:wrap; }
.copy-slug-btn, .icon-btn { display:inline-flex; align-items:center; justify-content:center; cursor:pointer; color:var(--pico-muted-color,#999); padding:1px; border-radius:3px; line-height:0; }
.copy-slug-btn:hover, .icon-btn:hover { color:var(--pico-primary,#007bff); }
.copy-slug-btn.copied svg { color:#4ade80!important; }
[data-lucide] { stroke-width:2; }
.edit-fab { position:relative; bottom:auto; right:auto; display:inline-flex; align-items:center; justify-content:center; gap:0.3rem; height:2.4rem; padding:0 0.7rem; border-radius:9999px; background:var(--pico-card-background-color,#fff); color:var(--pico-muted-color,#666); box-shadow:0 2px 8px rgba(0,0,0,0.15); border:1px solid var(--pico-muted-border-color,#ddd); transition:all .15s ease; text-decoration:none!important; }
.edit-fab:hover { color:var(--pico-primary,#007bff); box-shadow:0 4px 12px rgba(0,0,0,0.2); transform:translateY(-1px); }
.edit-fab [data-lucide], .edit-fab svg { width:1.1rem; height:1.1rem; }
.fab-label { font-size:0.75rem; font-weight:600; }
.fab-group { position:fixed; bottom:1rem; right:1rem; z-index:50; display:flex; flex-direction:column; gap:0.6rem; }
ul.page-tree, .page-tree ul { list-style:none!important; padding-left:1.2rem; margin:0; }
ul.page-tree { padding-left:0; }
.page-tree li { margin:0.15rem 0; padding:0; list-style:none!important; }
.page-tree li::marker { content:none; }
.page-tree ul li::before { content:none!important; }
.page-tree a { text-decoration:none; }
.page-tree a:hover { text-decoration:underline; }
.page-tree .tree-folder a { font-weight:500; }
.page-tree .tree-meta { color:var(--pico-muted-color,#999); font-size:0.75rem; }
.page-tree a.empty { color:var(--pico-muted-color,#999); font-style:italic; }
.page-tree .tree-icon, .page-tree .tree-icon svg { width:13px!important; height:13px!important; vertical-align:-2px; display:inline-block; }
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
<script>function copySlug(s,b){navigator.clipboard.writeText(s).then(function(){var ic=b.querySelector('svg');if(ic){ic.style.color='#4ade80';setTimeout(function(){ic.style.color=''},1200)}b.classList.add('copied');setTimeout(function(){b.classList.remove('copied')},1200)})}function runIcons(){if(window.lucide)lucide.createIcons()}window.addEventListener('DOMContentLoaded',runIcons);window.addEventListener('load',runIcons);</script>
</body>
</html>`,

	page: `{{#if user}}<div class="fab-group"><a href="/edit" class="edit-fab" title="New page"><i data-lucide="plus"></i><span class="fab-label">New</span></a><a href="/edit/{{slug}}" class="edit-fab" title="Edit page"><i data-lucide="pencil"></i><span class="fab-label">Edit</span></a></div>{{/if}}
<div class="page-header">
<div class="page-header-left">
<nav aria-label="breadcrumb"><ul>
{{#each breadcrumb}}
<li>{{#if href}}<a href="{{href}}">{{name}}</a>{{else}}{{name}}{{/if}}</li>
{{/each}}
</ul></nav>
<span class="copy-slug-btn" title="Copy slug" onclick="copySlug('{{slug}}',this)"><i data-lucide="copy" style="width:14px;height:14px"></i></span>
</div>
<small class="page-meta">{{#if page.isPublic}}<i data-lucide="globe" style="width:13px;height:13px;vertical-align:-2px"></i> public{{else}}<i data-lucide="lock" style="width:13px;height:13px;vertical-align:-2px"></i> <strong>private</strong>{{/if}} · updated {{page.updatedAt}}</small>
</div>
<article id="page-content"></article>
<div id="page-attachments" style="margin-top:1.5rem"></div>
<script id="page-data" type="application/json">{{{pageData}}}</script>`,


	list: `<h1>All pages</h1>
<ul class="page-tree">
{{#each items}}
<li class="tree-node"><a href="/pages/{{slug}}">{{#if isEmpty}}<i data-lucide="file" class="tree-icon"></i>{{else}}{{#if isPublic}}<i data-lucide="file-text" class="tree-icon"></i>{{else}}<i data-lucide="lock" class="tree-icon tree-lock" title="private"></i>{{/if}}{{/if}} {{#if title}}{{title}}{{else}}{{name}}{{/if}}</a> <span class="copy-slug-btn" title="Copy slug" onclick="copySlug('{{slug}}',this)"><i data-lucide="copy" class="tree-icon"></i></span>{{#if children.length}}<ul>{{> treeNode children=children}}</ul>{{/if}}</li>
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
<div class="empty-page">
<i data-lucide="file" style="width:2rem;height:2rem;color:var(--pico-muted-color,#999)"></i>
<h1>{{title}}</h1>
<p style="color:var(--pico-muted-color,#999)">This page has no content yet.</p>
{{#if canCreate}}
<p><a href="/edit/{{slug}}" role="button"><i data-lucide="pencil" style="width:1rem;height:1rem;vertical-align:-2px"></i> Write this page</a></p>
{{else}}
<p><small><a href="/login">Log in</a> to write this page.</small></p>
{{/if}}
</div>
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