import { resolveDataDir } from "../data.js";

// ── 원격 API 클라이언트 ──

export class BakewikiClient {
	private baseUrl: string;
	private apiKey: string;

	constructor(url: string, apiKey: string) {
		// 후행 슬래시 제거
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

	async listPages(): Promise<{ slug: string; title: string; public: boolean; updatedAt: string }[]> {
		const { ok, data } = await this.request("GET", "/api/pages");
		if (!ok) throw new Error(`Failed to list pages: ${JSON.stringify(data)}`);
		const pages = (data as { pages: { slug: string; title: string; isPublic: boolean; updatedAt: string }[] }).pages;
		return pages.map((p) => ({ slug: p.slug, title: p.title, public: p.isPublic, updatedAt: p.updatedAt }));
	}

	async getPage(slug: string): Promise<{ slug: string; title: string; public: boolean; updatedAt: string; content: string }> {
		const { ok, status, data } = await this.request("GET", `/api/pages/${slug}`);
		if (status === 301 && data && typeof data === "object" && "redirect" in data) {
			throw new Error(`Page moved: ${slug} → ${(data as { redirect: string }).redirect}. Use the new slug.`);
		}
		if (!ok) throw new Error(`Page not found: ${slug}`);
		const page = (data as { page: { slug: string; title: string; isPublic: boolean; updatedAt: string; content: string } }).page;
		return { slug: page.slug, title: page.title, public: page.isPublic, updatedAt: page.updatedAt, content: page.content };
	}

	async createPage(slug: string, content: string): Promise<{ slug: string; title: string }> {
		const { ok, data } = await this.request("POST", `/api/pages/${slug}`, { content });
		if (!ok) throw new Error(`Failed to create page: ${JSON.stringify(data)}`);
		return data as { slug: string; title: string };
	}

	async renamePage(oldSlug: string, newSlug: string): Promise<{ slug: string; title: string }> {
		const { ok, status, data } = await this.request("PATCH", `/api/pages/${oldSlug}`, { slug: newSlug });
		if (!ok) throw new Error(`Failed to rename page: ${JSON.stringify(data)} (status ${status})`);
		return data as { slug: string; title: string };
	}

	async deletePage(slug: string): Promise<void> {
		const { ok, data } = await this.request("DELETE", `/api/pages/${slug}`);
		if (!ok) throw new Error(`Failed to delete page: ${JSON.stringify(data)}`);
	}

	async searchPages(query: string): Promise<{ slug: string; title: string; snippet: string }[]> {
		const { ok, data } = await this.request("GET", `/api/search?q=${encodeURIComponent(query)}`);
		if (!ok) throw new Error(`Failed to search: ${JSON.stringify(data)}`);
		return (data as { results: { slug: string; title: string; snippet: string }[] }).results;
	}

	async sitemap(): Promise<{ slug: string; children?: Record<string, unknown> }[]> {
		const { ok, data } = await this.request("GET", "/api/sitemap");
		if (!ok) throw new Error(`Failed to get sitemap: ${JSON.stringify(data)}`);
		return (data as { tree: { slug: string; children?: Record<string, unknown> }[] }).tree;
	}

	async health(): Promise<boolean> {
		try {
			const { ok } = await this.request("GET", "/api/health");
			return ok;
		} catch {
			return false;
		}
	}
}

// ── 원격 옵션 파싱 ──

export interface RemoteOpts {
	url: string;
	key: string;
}

// --url과 --key를 args에서 추출. 환경변수 폴백 포함.
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

// ── pages 서브커맨드 ──

export async function remoteCommand(subcommand: string, allArgs: string[]): Promise<void> {
	const { opts, rest } = extractRemoteOpts(allArgs);

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
			// 테이블 헤더
			const maxSlug = Math.max(4, ...pages.map((p) => p.slug.length));
			const maxTitle = Math.max(5, ...pages.map((p) => p.title.length));
			console.log(`${"SLUG".padEnd(maxSlug)}  ${"TITLE".padEnd(maxTitle)}  VIS  UPDATED`);
			for (const p of pages) {
				const vis = p.public ? "pub" : "pri";
				const date = p.updatedAt.slice(0, 10);
				console.log(`${p.slug.padEnd(maxSlug)}  ${p.title.padEnd(maxTitle)}  ${vis}  ${date}`);
			}
			break;
		}

		case "get": {
			validateKey(opts.key);
			const slug = rest[0];
			if (!slug) {
				console.error("Usage: bakewiki pages get <slug>");
				process.exit(1);
			}
			const client = new BakewikiClient(opts.url, opts.key);
			const page = await client.getPage(slug);
			console.log(`slug:    ${page.slug}`);
			console.log(`title:   ${page.title}`);
			console.log(`public:  ${page.public}`);
			console.log(`updated: ${page.updatedAt}`);
			console.log("---");
			console.log(page.content);
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
				console.error("Usage: bakewiki pages rename <old-slug> <new-slug>");
				process.exit(1);
			}
			const client = new BakewikiClient(opts.url, opts.key);
			const result = await client.renamePage(oldSlug, newSlug);
			console.log(`Renamed: ${oldSlug} → ${result.slug} (${result.title})`);
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
			for (const r of results) {
				console.log(`${r.slug}  ${r.title}`);
				const snippet = r.snippet.replace(/<[^>]+>/g, "");
				if (snippet) console.log(`  ${snippet}`);
			}
			break;
		}

		case "sitemap": {
			const client7 = new BakewikiClient(opts.url, opts.key);
			const tree = await client7.sitemap();
			function printTree(nodes: { slug: string; children?: Record<string, unknown> }[], depth = 0) {
				for (const node of nodes) {
					console.log(`${"  ".repeat(depth)}${node.slug}`);
					if (node.children) {
						const childNodes = Object.values(node.children) as { slug: string; children?: Record<string, unknown> }[];
						printTree(childNodes, depth + 1);
					}
				}
			}
			printTree(tree);
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
			console.error("Available: list, get, create, rename, delete, search, sitemap, health");
			process.exit(1);
	}
}
