import Handlebars from "handlebars";

// 헬퍼 등록
Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("json", (v) => JSON.stringify(v));

// 템플릿 컴파일 캐시 (파일 경로 → 컴파일된 함수)
const cache = new Map<string, HandlebarsTemplateDelegate>();

const TEMPLATES: Record<string, string> = {
	layout: `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}}{{#if site}} - {{site}}{{/if}}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 1rem auto; padding: 0 1rem; color: #222; line-height: 1.6; }
a { color: #2563eb; }
nav { display: flex; gap: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 0.5rem; margin-bottom: 1.5rem; font-size: 0.9rem; }
nav form { margin-left: auto; display: flex; gap: 0.3rem; }
nav input[type=text] { flex: 0 0 200px; }
pre.hljs { padding: 0.8rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; }
code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.9em; }
pre code { background: none; padding: 0; }
.muted { color: #999; font-size: 0.8rem; }
.page-meta { color: #999; font-size: 0.8rem; margin-bottom: 1rem; }
ul.pages { list-style: none; padding: 0; }
ul.pages li { padding: 0.3rem 0; }
mark { background: #fef08a; }
textarea { width: 100%; height: 400px; font-family: monospace; padding: 0.5rem; }
.btn { display: inline-block; padding: 0.4rem 1rem; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; }
.login-form { max-width: 300px; }
.login-form label { display: block; margin: 0.5rem 0 0.2rem; }
.login-form input { width: 100%; padding: 0.4rem; }
</style>
</head>
<body>
<nav>
<a href="/">Home</a>
<a href="/search">Search</a>
{{#if user}}
<a href="/edit">New</a>
<form action="/logout" method="post" style="margin:0;display:inline">
<button type="submit" style="background:none;border:none;color:#2563eb;cursor:pointer;padding:0;font-size:inherit">Logout</button>
</form>
{{else}}
<a href="/login">Login</a>
{{/if}}
<form action="/search" method="get">
<input type="text" name="q" placeholder="search..." value="{{q}}">
<button type="submit">Go</button>
</form>
</nav>
{{{body}}}
</body>
</html>`,

	page: `<article>
<h1>{{page.title}}</h1>
<div class="page-meta">{{#if page.public}}public{{else}}<strong>private</strong>{{/if}} · updated {{page.updatedAt}}</div>
{{{html}}}
</article>
{{#if user}}
<p><a href="/edit/{{page.slug}}">Edit</a></p>
{{/if}}`,

	list: `<h1>All pages</h1>
<ul class="pages">
{{#each pages}}
<li><a href="/page/{{slug}}">{{title}}</a> <span class="muted">{{slug}}{{#unless public}} 🔒{{/unless}}</span></li>
{{/each}}
</ul>`,

	search: `<h1>Search{{#if q}}: {{q}}{{/if}}</h1>
{{#if results}}
<ul class="pages">
{{#each results}}
<li><a href="/page/{{slug}}">{{title}}</a><br><span class="muted">{{{snippet}}}</span></li>
{{/each}}
</ul>
{{else}}
<p class="muted">No results.</p>
{{/if}}`,

	notFound: `<h1>Not found</h1>
<p>The page you requested does not exist.</p>
<p><a href="/">Home</a></p>`,

	login: `<h1>Login</h1>
<form class="login-form" action="/login" method="post">
<label>Email</label>
<input type="email" name="email" required>
<label>Password</label>
<input type="password" name="password" required>
<button class="btn" type="submit">Login</button>
</form>
{{#if error}}<p style="color:red">{{error}}</p>{{/if}}`,

	editor: `<h1>{{#if page}}Edit: {{page.title}}{{else}}New page{{/if}}</h1>
<form action="/edit/{{#if page}}{{page.slug}}{{/if}}" method="post">
<label>Slug <span class="muted">(path, e.g. tech/web/http)</span></label>
<input type="text" name="slug" value="{{#if page}}{{page.slug}}{{else}}{{slug}}{{/if}}" style="width:100%;padding:0.4rem;margin-bottom:0.5rem" {{#if page}}readonly{{/if}}>
<label>Content (GFM, with YAML frontmatter)</label>
<textarea name="content">{{#if page}}{{page.content}}{{else}}---\ntitle: \npublic: true\n---\n# \n{{/if}}</textarea>
<div style="margin-top:0.5rem">
<button class="btn" type="submit">Save</button>
{{#if page}}<a href="/page/{{page.slug}}" class="muted">cancel</a>{{/if}}
</div>
</form>`,
};

export function renderTemplate(name: string, data: Record<string, unknown>, layoutData?: Record<string, unknown>): string {
	const tmpl = cache.get(name) ?? Handlebars.compile(TEMPLATES[name]);
	if (!cache.has(name)) cache.set(name, tmpl);
	const body = tmpl(data);
	if (layoutData || name === "notFound") {
		const layout = cache.get("layout") ?? Handlebars.compile(TEMPLATES.layout);
		if (!cache.has("layout")) cache.set("layout", layout);
		return layout({ ...layoutData, body, title: layoutData?.title ?? name });
	}
	return body;
}
