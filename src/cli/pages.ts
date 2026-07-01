import { resolveDataDir } from "../data.js";

// ── Remote API client ──

export class BakewikiClient {
	private baseUrl: string;
	private apiKey: string;

	constructor(url: string, apiKey: string) {
		// strip trailing slash
		this.baseUrl = url.replace(/\/+$/, "");
		this.apiKey = apiKey;
	}

	private async request(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
		const res = await fetch(`${this.baseUrl}${path}`, {
			method,
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		const data = await res.json().catch(() => null);
		return { ok: res.ok, status: res.status, data };
	}

	async listPages(): Promise<{ path: string; slug: string; title: string; public: boolean; inheritedPrivate?: boolean; updatedAt: string }[]> {
		const { ok, data } = await this.request("GET", "/api/pages");
		if (!ok) throw new Error(`Failed to list pages: ${JSON.stringify(data)}`);
		const pages = (data as { pages: { path: string; slug: string; title: string; public: boolean; inheritedPrivate?: boolean; updatedAt: string }[] }).pages;
		return pages;
	}

	async getPage(slug: string): Promise<{ path: string; slug: string; title: string; public: boolean; inheritedPrivate?: boolean; updatedAt: string; content: string }> {
		const { ok, status, data } = await this.request("GET", `/api/pages/${slug}`);
		if (!ok) throw new Error(`Page not found: ${slug}`);
		const page = (data as { page: { path: string; slug: string; title: string; public: boolean; inheritedPrivate?: boolean; updatedAt: string; content: string } }).page;
		return page;
	}

	async createPage(slug: string, content: string): Promise<{ path: string; slug: string; title: string }> {
		const { ok, data } = await this.request("POST", `/api/pages/${slug}`, { content });
		if (!ok) throw new Error(`Failed to create page: ${JSON.stringify(data)}`);
		return data as { path: string; slug: string; title: string };
	}

	async renamePage(oldSlug: string, newSlug: string): Promise<{ path: string; slug: string; title: string }> {
		const { ok, status, data } = await this.request("PATCH", `/api/pages/${oldSlug}`, { slug: newSlug });
		if (!ok) throw new Error(`Failed to rename page: ${JSON.stringify(data)} (status ${status})`);
		return data as { path: string; slug: string; title: string };
	}

	async patchPage(slug: string, fields: { slug?: string; public?: boolean; body?: string; title?: string }): Promise<{ path: string; slug: string; title: string; public: boolean; inheritedPrivate?: boolean; updatedAt: string }> {
		const { ok, status, data } = await this.request("PATCH", `/api/pages/${slug}`, fields);
		if (!ok) throw new Error(`Failed to patch page: ${JSON.stringify(data)} (status ${status})`);
		return data as { path: string; slug: string; title: string; public: boolean; inheritedPrivate?: boolean; updatedAt: string };
	}

	async deletePage(slug: string): Promise<void> {
		const { ok, data } = await this.request("DELETE", `/api/pages/${slug}`);
		if (!ok) throw new Error(`Failed to delete page: ${JSON.stringify(data)}`);
	}

	async searchPages(query: string): Promise<{ path: string; slug: string; title: string; snippet: string }[]> {
		const { ok, data } = await this.request("GET", `/api/search?q=${encodeURIComponent(query)}`);
		if (!ok) throw new Error(`Failed to search: ${JSON.stringify(data)}`);
		return (data as { results: { path: string; slug: string; title: string; snippet: string }[] }).results;
	}

	async sitemap(): Promise<{ name: string; path: string; slug?: string; children?: Record<string, unknown> }[]> {
		const { ok, data } = await this.request("GET", "/api/sitemap");
		if (!ok) throw new Error(`Failed to get sitemap: ${JSON.stringify(data)}`);
		return (data as { tree: { name: string; path: string; slug?: string; children?: Record<string, unknown> }[] }).tree;
	}

	async health(): Promise<boolean> {
		try {
			const { ok } = await this.request("GET", "/api/health");
			return ok;
		} catch {
			return false;
		}
	}

	// ── File (image) API ──

	async listFiles(): Promise<{ url: string; filename: string; original: string; ext: string; size: number }[]> {
		const { ok, data } = await this.request("GET", "/api/upload");
		if (!ok) throw new Error(`Failed to list files: ${JSON.stringify(data)}`);
		return (data as { files: { url: string; filename: string; original: string; ext: string; size: number }[] }).files;
	}

	async uploadFile(filename: string, data: Buffer, slug: string): Promise<{ url: string; filename: string; original: string; ext: string; size: number }> {
		const form = new FormData();
		form.append("file", new Blob([data as unknown as never]), filename);
		form.append("slug", slug);
		const res = await fetch(`${this.baseUrl}/api/upload`, {
			method: "POST",
			headers: { Authorization: `Bearer ${this.apiKey}` },
			body: form,
		});
		const json = await res.json().catch(() => null);
		if (!res.ok) throw new Error(`Failed to upload file: ${JSON.stringify(json)}`);
		return json as { url: string; filename: string; original: string; ext: string; size: number };
	}

	async deleteFile(filename: string): Promise<void> {
		const { ok, data } = await this.request("DELETE", `/api/upload/${encodeURIComponent(filename)}`);
		if (!ok) throw new Error(`Failed to delete file: ${JSON.stringify(data)}`);
	}

	async listFilesBySlug(slug: string): Promise<{ url: string; filename: string; original: string; ext: string; size: number }[]> {
		const { ok, data } = await this.request("GET", `/api/upload/by-slug/${encodeURIComponent(slug)}`);
		if (!ok) throw new Error(`Failed to list files: ${JSON.stringify(data)}`);
		return (data as { files: { url: string; filename: string; original: string; ext: string; size: number }[] }).files;
	}

	async downloadFile(url: string): Promise<Buffer> {
		const res = await fetch(`${this.baseUrl}${url}`, {
			headers: { Authorization: `Bearer ${this.apiKey}` },
		});
		if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
		return Buffer.from(await res.arrayBuffer());
	}
}

// ── Remote options parsing ──

export interface RemoteOpts {
	url: string;
	key: string;
}

// Extract --url and --key from args. Includes env fallbacks.
export function extractRemoteOpts(args: string[]): { opts: RemoteOpts; rest: string[] } {
	let url = "";
	let key = "";
	const rest: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--url" && args[i + 1]) {
			url = args[++i];
		} else if (args[i] === "--key" && args[i + 1]) {
			key = args[++i];
		} else {
			rest.push(args[i]);
		}
	}
	return {
		opts: {
			url: url || process.env.BAKEWIKI_URL || "http://127.0.0.1:3000",
			key: key || process.env.BAKEWIKI_API_KEY || "",
		},
		rest,
	};
}

function validateKey(key: string): void {
	if (!key) {
		console.error("Error: API key required. Use --key <key> or set BAKEWIKI_API_KEY.");
		process.exit(1);
	}
}

// ── pages subcommands ──

export async function remoteCommand(subcommand: string, allArgs: string[], opts: RemoteOpts): Promise<void> {
	const rest = allArgs;

	// file subcommand is two-level: file <list|upload|delete> [...]
	if (subcommand === "file" || subcommand === "files") {
		const fileSub = rest[0];
		const fileArgs = rest.slice(1);
		return fileCommand(fileSub, fileArgs, opts);
	}

	switch (subcommand) {
		case "list":
		case "ls": {
			validateKey(opts.key);
			const client = new BakewikiClient(opts.url, opts.key);
			const pages = await client.listPages();
			if (pages.length === 0) {
				console.log("No pages.");
				return;
			}
			// 트리 구조로 출력 (path별 그룹)
			printPageTree(pages);
			break;
		}

		case "get": {
			validateKey(opts.key);
			const slugs = rest;
			if (slugs.length === 0) {
				console.error("Usage: bakewiki remote get <slug> [slug2 slug3 ...]");
				process.exit(1);
			}
			const client = new BakewikiClient(opts.url, opts.key);
			for (let i = 0; i < slugs.length; i++) {
				const page = await client.getPage(slugs[i]);
				const body = page.content;
				if (i > 0) console.log("----");
				console.log(`path:    ${page.path}`);
				console.log(`slug:    ${page.slug}`);
				console.log(`title:   ${page.title}`);
				console.log(`public:  ${page.public}${page.inheritedPrivate ? " (protected)" : ""}`);
				console.log(`updated: ${page.updatedAt.slice(0, 10)}`);
				console.log("---");
				console.log(body.trimEnd());
			}
			break;
		}

		case "create": {
			validateKey(opts.key);
			const slug = rest[0];
			const file = rest[1];
			if (!slug || !file) {
				console.error("Usage: bakewiki pages create <slug> <file>");
				process.exit(1);
			}
			const fs = await import("node:fs/promises");
			const path = await import("node:path");
			const content = await fs.readFile(path.resolve(file), "utf-8");
			const client = new BakewikiClient(opts.url, opts.key);
			const result = await client.createPage(slug, content);
			console.log(`Created: ${result.slug} (${result.title})`);
			break;
		}

		case "rename": {
			validateKey(opts.key);
			const oldSlug = rest[0];
			const newSlug = rest[1];
			if (!oldSlug || !newSlug) {
				console.error("Usage: bakewiki remote rename <old-slug> <new-slug>");
				process.exit(1);
			}
			const client = new BakewikiClient(opts.url, opts.key);
			const result = await client.renamePage(oldSlug, newSlug);
			console.log(`Renamed: ${oldSlug} → ${result.slug} (${result.title})`);
			break;
		}

		case "patch": {
			validateKey(opts.key);
			const patchSlug = rest[0];
			if (!patchSlug) {
				console.error("Usage: bakewiki remote patch <slug> [--slug <new-slug>] [--public <true|false>] [--body <file|->]");
				process.exit(1);
			}
			const fields: { slug?: string; public?: boolean; body?: string } = {};
			for (let i = 1; i < rest.length; i++) {
				if (rest[i] === "--slug" && rest[i + 1]) { fields.slug = rest[++i]; }
				else if (rest[i] === "--public" && rest[i + 1]) { fields.public = rest[++i] === "true"; }
				else if (rest[i] === "--body" && rest[i + 1]) {
					const bodyFile = rest[++i];
					const fs = await import("node:fs/promises");
					const path = await import("node:path");
					if (bodyFile === "-") {
						const chunks: Buffer[] = [];
						for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
						fields.body = Buffer.concat(chunks).toString("utf-8");
					} else {
						fields.body = await fs.readFile(path.resolve(bodyFile), "utf-8");
					}
				}
			}
			if (Object.keys(fields).length === 0) {
				console.error("Error: No fields to update. Provide --slug, --public, or --body.");
				process.exit(1);
			}
			const clientPatch = new BakewikiClient(opts.url, opts.key);
			const patched = await clientPatch.patchPage(patchSlug, fields);
			console.log(`Patched: ${patched.slug} (title: ${patched.title}, public: ${patched.public})`);
			break;
		}

		case "delete": {
			validateKey(opts.key);
			const slug = rest[0];
			if (!slug) {
				console.error("Usage: bakewiki remote delete <slug>");
				process.exit(1);
			}
			const client5 = new BakewikiClient(opts.url, opts.key);
			await client5.deletePage(slug);
			console.log(`Deleted: ${slug}`);
			break;
		}

		case "search": {
			const query = rest[0];
			if (!query) {
				console.error("Usage: bakewiki remote search <query>");
				process.exit(1);
			}
			const client6 = new BakewikiClient(opts.url, opts.key);
			const results = await client6.searchPages(query);
			if (results.length === 0) {
				console.log("No results.");
				return;
			}
			for (let i = 0; i < results.length; i++) {
				const r = results[i];
				const snippet = r.snippet.replace(/<[^>]+>/g, "").trim();
				if (i > 0) console.log("----");
				console.log(`path:    ${r.path}`);
				console.log(`slug:    ${r.slug}`);
				console.log(`title:   ${r.title}`);
				if (snippet) console.log(`snippet: ${snippet}`);
			}
			console.log(`----`);
			console.log(`${results.length} results`);
			break;
		}

		case "sitemap": {
			const client7 = new BakewikiClient(opts.url, opts.key);
			const tree = await client7.sitemap();
			function printSitemap(nodes: { name: string; path: string; slug?: string; title?: string; public?: boolean; children?: Record<string, unknown> }[], depth = 0) {
				for (const node of nodes) {
					const label = node.title || node.name;
					const vis = node.public === false ? " 🔒" : "";
					const id = node.slug ? `slug: ${node.slug}` : `path: ${node.path}/${node.name}`;
					console.log(`${"  ".repeat(depth)}${label}${vis}  (${id})`);
					if (node.children) {
						const childNodes = Object.values(node.children) as { name: string; path: string; slug?: string; title?: string; public?: boolean; children?: Record<string, unknown> }[];
						printSitemap(childNodes, depth + 1);
					}
				}
			}
			printSitemap(tree);
			break;
		}

		case "health": {
			const client8 = new BakewikiClient(opts.url, opts.key);
			const ok = await client8.health();
			console.log(ok ? "OK" : "FAIL");
			process.exit(ok ? 0 : 1);
		}

		default:
			console.error(`Unknown remote subcommand: ${subcommand}`);
			console.error("Available: list, get, create, rename, patch, delete, search, sitemap, health, file");
			process.exit(1);
	}
}

// ── file subcommand (upload management) ──
async function fileCommand(sub: string | undefined, args: string[], opts: RemoteOpts): Promise<void> {
	switch (sub) {
		case "list":
		case "ls": {
			validateKey(opts.key);
			// Optional --slug
			let listSlug = "";
			const listArgs = args.filter(function (a, i) {
				if (a === "--slug") { listSlug = args[i + 1] || ""; return false; }
				if (args[i - 1] === "--slug") return false;
				return true;
			});
			const client = new BakewikiClient(opts.url, opts.key);
			const files = listSlug ? await client.listFilesBySlug(listSlug) : await client.listFiles();
			if (files.length === 0) {
				console.log("No files.");
				return;
			}
			const maxName = Math.max(4, ...files.map((f) => f.original.length));
			console.log(`${"NAME".padEnd(maxName)}  SIZE       URL`);
			for (const f of files) {
				const size = formatSize(f.size);
				console.log(`${f.original.padEnd(maxName)}  ${size.padStart(9)}  ${f.url}`);
			}
			break;
		}

		case "upload": {
			validateKey(opts.key);
			const file = args[0];
			if (!file) {
				console.error("Usage: bakewiki remote file upload <file|-> [name] [--slug <slug>]");
				process.exit(1);
			}
			// Optional --slug
			let slug = "";
			const posArgs = args.filter(function (a, i) {
				if (a === "--slug") { slug = args[i + 1] || ""; return false; }
				if (args[i - 1] === "--slug") return false;
				return true;
			});
			const realFile = posArgs[0];
			const explicitName = posArgs[1];
			const fs = await import("node:fs/promises");
			const path = await import("node:path");
			const client = new BakewikiClient(opts.url, opts.key);
			let name: string;
			let data: Buffer;
			if (realFile === "-") {
				// stdin
				const chunks: Buffer[] = [];
				for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
				data = Buffer.concat(chunks);
				name = explicitName || "upload.png";
			} else {
				const resolved = path.resolve(realFile);
				name = explicitName || path.basename(resolved);
				data = await fs.readFile(resolved);
			}
			const result = await client.uploadFile(name, data, slug);
			console.log(`Uploaded: ${result.url} (${formatSize(result.size)})`);
			break;
		}

		case "delete":
		case "rm": {
			validateKey(opts.key);
			const filename = args[0];
			if (!filename) {
				console.error("Usage: bakewiki remote file delete <filename>");
				process.exit(1);
			}
			const client = new BakewikiClient(opts.url, opts.key);
			await client.deleteFile(filename);
			console.log(`Deleted: ${filename}`);
			break;
		}

		case "download":
		case "dl": {
			validateKey(opts.key);
			const dlInput = args[0];
			const output = args[1];
			if (!dlInput) {
				console.error("Usage: bakewiki remote file download <url|filename> [output|-");
				process.exit(1);
			}
			const client = new BakewikiClient(opts.url, opts.key);
			// /pages/로 시작하지 않으면 파일명으로 간주
			const fileUrl = dlInput.startsWith("/pages/") ? dlInput : `/pages/${dlInput}`;
			const data = await client.downloadFile(fileUrl);
			if (!output || output === "-") {
				process.stdout.write(data);
			} else {
				const fs = await import("node:fs/promises");
				const path = await import("node:path");
				const outPath = path.resolve(output);
				await fs.writeFile(outPath, data);
				console.log(`Downloaded: ${outPath} (${formatSize(data.length)})`);
			}
			break;
		}

		default:
			console.error(`Unknown file subcommand: ${sub}`);
			console.error("Available: list, upload, download, delete");
			process.exit(1);
	}
}



// 페이지 목록을 path 트리로 출력.
function printPageTree(pages: Array<{ path: string; slug: string; title: string; public: boolean; inheritedPrivate?: boolean; updatedAt: string }>): void {
	type TreeNode = {
		name: string;
		slug?: string;
		title?: string;
		public?: boolean;
		inheritedPrivate?: boolean;
		isPage: boolean;
		children: Map<string, TreeNode>;
	};

	const root: TreeNode = { name: "", isPage: false, children: new Map() };
	for (const page of pages) {
		const segments = page.slug.split("/");
		let node = root;
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			const isLast = i === segments.length - 1;
			if (!node.children.has(seg)) {
				node.children.set(seg, { name: seg, isPage: false, children: new Map() });
			}
			const child = node.children.get(seg)!;
			if (isLast) {
				child.isPage = true;
				child.slug = page.slug;
				child.title = page.title;
				child.public = page.public;
				child.inheritedPrivate = page.inheritedPrivate;
			}
			node = child;
		}
	}

	function flatten(n: TreeNode, depth: number, prefix: string): void {
		const dirs: TreeNode[] = [];
		const leafPages: TreeNode[] = [];
		for (const child of n.children.values()) {
			if (child.children.size > 0) dirs.push(child);
			else leafPages.push(child);
		}
		dirs.sort((a, b) => a.name.localeCompare(b.name));
		leafPages.sort((a, b) => a.name.localeCompare(b.name));

		for (const d of dirs) {
			const dirPath = prefix ? prefix + "/" + d.name : d.name;
			const indent = "  ".repeat(depth);
			if (d.isPage) {
				const vis = d.inheritedPrivate ? " 🛡️" : d.public === false ? " 🔒" : "";
				console.log(`${indent}${d.title || d.name}${vis}  (${d.slug})`);
			} else {
				console.log(`${indent}${d.name}  (${dirPath})`);
			}
			flatten(d, depth + 1, dirPath);
		}
		for (const p of leafPages) {
			const indent = "  ".repeat(depth);
			const vis = p.inheritedPrivate ? " 🛡️" : p.public === false ? " 🔒" : "";
			console.log(`${indent}${p.title || p.name}${vis}  (${p.slug})`);
		}
	}
	flatten(root, 0, "");
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
	return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}
