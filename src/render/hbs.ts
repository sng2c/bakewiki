import Handlebars from "handlebars";

// 헬퍼 등록
Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("json", (v) => JSON.stringify(v));

// 템플릿 컴파일 캐시 (이름 → 컴파일된 함수)
const cache = new Map<string, HandlebarsTemplateDelegate>();

const TEMPLATES: Record<string, string> = {
	layout: `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css">
<style>
main.container { max-width: 800px; }
nav.container-fluid { flex-wrap: wrap; }
textarea[name="content"] { min-height: 320px; font-family: monospace; }
article { padding: 1rem; margin-top: 1rem; }
article > :first-child { margin-top: 0; }
article > :last-child { margin-bottom: 0; }
.page-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem 1rem; margin-bottom:1rem; }
.page-header nav[aria-label="breadcrumb"] { margin:0; }
.editor-split { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
@media (max-width:768px) { .editor-split { grid-template-columns:1fr; } }
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
<main class="container">
{{{body}}}
</main>
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
<article>
{{{html}}}
</article>
{{#if user}}
<p><a href="/edit/{{page.slug}}" role="button">Edit</a></p>
{{/if}}`,

	list: `<h1>All pages</h1>
<ul>
{{#each pages}}
<li><a href="/pages/{{slug}}">{{title}}</a> <small>{{slug}}{{#unless isPublic}} 🔒{{/unless}}</small></li>
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
<label>Slug <small>(leave empty to auto-generate)</small>
<input type="text" name="slug" value="{{#if page}}{{page.slug}}{{else}}{{slug}}{{/if}}">
</label>
<label>Title
<input type="text" name="title" value="{{title}}">
</label>
<label>
<input type="checkbox" name="public" {{#if public}}checked{{/if}}> Public
</label>
<div class="editor-split">
<div>
<label>Content (GFM)
<textarea name="content" id="editor-content">{{body}}</textarea>
</label>
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
</form>
<script src="https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/highlight.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/contrib/auto-render.min.js"></script>
<script>
(function(){
  var md = markdownit({ html:true, linkify:true, typographer:false, highlight:function(str,lang){
    if(lang&&hljs.getLanguage(lang)){try{return '<pre class="hljs"><code>'+hljs.highlight(str,{language:lang}).value+'</code></pre>';}catch(e){}}
    return '<pre class="hljs"><code>'+md.utils.escapeHtml(str)+'</code></pre>';
  }});
  // 링크 해석: 절대 경로 → /pages 접두사, 상대 경로 → 슬러그 기준 해석
  var currentSlug='';
  var defaultNormalizeLink=md.normalizeLink.bind(md);
  md.normalizeLink=function(url){
    if(url.startsWith('/')&&!url.startsWith('//')) return defaultNormalizeLink('/pages'+url);
    if(url.startsWith('#')) return defaultNormalizeLink(url);
    if(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return defaultNormalizeLink(url);
    if(currentSlug){
      var parts=currentSlug.split('/').concat(url.split('/'));
      var resolved=[];
      for(var i=0;i<parts.length;i++){
        if(parts[i]==='..'){if(resolved.length>0)resolved.pop();}
        else if(parts[i]!=='.'&&parts[i]!=='')resolved.push(parts[i]);
      }
      return defaultNormalizeLink('/pages/'+resolved.join('/'));
    }
    return defaultNormalizeLink(url);
  };
  var ta=document.getElementById('editor-content');
  var pv=document.getElementById('editor-preview');
  var title=document.querySelector('input[name=title]');
  var slug=document.querySelector('input[name=slug]');
  var timer;
  function update(){
    currentSlug=slug?slug.value:'';
    var t=title?title.value:'';
    var c='# '+t+'\\n\\n'+ta.value;
    pv.innerHTML=md.render(c);
    renderMathInElement(pv,{delimiters:[
      {left:'$$',right:'$$',display:true},
      {left:'$',right:'$',display:false},
      {left:'\\(',right:'\\)',display:false},
      {left:'\\[',right:'\\]',display:true}
    ]});
  }
  function debounce(){clearTimeout(timer);timer=setTimeout(update,400);}
  ta.addEventListener('input',debounce);
  if(title)title.addEventListener('input',debounce);
  update();
})();
</script>`,

	settings: `<article>
<h1>Settings</h1>
<h2>Account</h2>
<p>Email: <strong>{{email}}</strong></p>
<form action="/logout" method="post"><button type="submit" class="outline secondary">Logout</button></form>
<h2>API Key</h2>
{{#if apiKey}}
<pre><code>{{apiKey}}</code></pre>
<small>Save this key now. It will not be shown again.</small>
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