import { BakewikiClient, type RemoteOpts } from "./pages.js";

// ── llm 명령 ──
// remote 명령과 동일한 서브명령 구조를 가지지만, 모든 출력을 JSON으로.
// LLM/스크립트가 파싱하기 쉬운 형태. 에러는 stderr로 JSON 출력.
// 성공 시 stdout에만 JSON (파이프라인에서 안전).

function emit(data: unknown): void {
	process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

function fail(message: string): never {
	process.stderr.write(JSON.stringify({ error: message }) + "\n");
	process.exit(1);
}

function validateKey(key: string): void {
	if (!key) fail("API key required. Use --key <key> or set BAKEWIKI_API_KEY.");
}

function client(opts: RemoteOpts): BakewikiClient {
	return new BakewikiClient(opts.url, opts.key);
}

export async function llmCommand(subcommand: string, allArgs: string[], opts: RemoteOpts): Promise<void> {
	const rest = allArgs;

	// file 서브명령은 2단계: llm file <list|upload|download|delete>
	if (subcommand === "file" || subcommand === "files") {
		return llmFileCommand(rest[0], rest.slice(1), opts);
	}

	try {
		switch (subcommand) {
			case "list":
			case "ls": {
				validateKey(opts.key);
				const pages = await client(opts).listPages();
				emit(pages);
				break;
			}

			case "get": {
				validateKey(opts.key);
				const slugs = rest;
				if (slugs.length === 0) fail("Usage: llm get <slug> [slug2 ...]");
				const results = await Promise.all(slugs.map((s) => client(opts).getPage(s)));
				// 단일 페이지면 객체, 여러 개면 배열
				emit(results.length === 1 ? results[0] : results);
				break;
			}

			case "create": {
				validateKey(opts.key);
				const slug = rest[0];
				const file = rest[1];
				if (!slug || !file) fail("Usage: llm create <slug> <file>");
				const fs = await import("node:fs/promises");
				const path = await import("node:path");
				const content = await fs.readFile(path.resolve(file), "utf-8");
				const result = await client(opts).createPage(slug, content);
				emit(result);
				break;
			}

			case "rename": {
				validateKey(opts.key);
				const [oldSlug, newSlug] = rest;
				if (!oldSlug || !newSlug) fail("Usage: llm rename <old-slug> <new-slug>");
				const result = await client(opts).renamePage(oldSlug, newSlug);
				emit(result);
				break;
			}

			case "patch": {
				validateKey(opts.key);
				const patchSlug = rest[0];
				if (!patchSlug) fail("Usage: llm patch <slug> [--slug <new>] [--public <bool>] [--body <file|->] [--title <title>]");
				const fields: { slug?: string; public?: boolean; body?: string; title?: string } = {};
				for (let i = 1; i < rest.length; i++) {
					if (rest[i] === "--slug" && rest[i + 1]) fields.slug = rest[++i];
					else if (rest[i] === "--public" && rest[i + 1]) fields.public = rest[++i] === "true";
					else if (rest[i] === "--title" && rest[i + 1]) fields.title = rest[++i];
					else if (rest[i] === "--body" && rest[i + 1]) {
						const bodyFile = rest[++i];
						if (bodyFile === "-") {
							const chunks: Buffer[] = [];
							for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
							fields.body = Buffer.concat(chunks).toString("utf-8");
						} else {
							const fs = await import("node:fs/promises");
							const path = await import("node:path");
							fields.body = await fs.readFile(path.resolve(bodyFile), "utf-8");
						}
					}
				}
				if (Object.keys(fields).length === 0) fail("No fields to update. Provide --slug, --public, --body, or --title.");
				const patched = await client(opts).patchPage(patchSlug, fields);
				emit(patched);
				break;
			}

			case "delete": {
				validateKey(opts.key);
				const slug = rest[0];
				if (!slug) fail("Usage: llm delete <slug>");
				await client(opts).deletePage(slug);
				emit({ deleted: slug });
				break;
			}

			case "search": {
				const query = rest[0];
				if (!query) fail("Usage: llm search <query>");
				const results = await client(opts).searchPages(query);
				emit({ query, count: results.length, results });
				break;
			}

			case "sitemap": {
				const tree = await client(opts).sitemap();
				emit({ tree });
				break;
			}

			case "health": {
				const ok = await client(opts).health();
				emit({ ok });
				if (!ok) process.exit(1);
				break;
			}

			default:
				fail(`Unknown llm subcommand: ${subcommand}. Available: list, get, create, rename, patch, delete, search, sitemap, health, file`);
		}
	} catch (e) {
		fail(e instanceof Error ? e.message : String(e));
	}
}

async function llmFileCommand(sub: string | undefined, args: string[], opts: RemoteOpts): Promise<void> {
	try {
		switch (sub) {
			case "list":
			case "ls": {
				validateKey(opts.key);
				let listSlug = "";
				const posArgs = args.filter((a, i) => {
					if (a === "--slug") { listSlug = args[i + 1] || ""; return false; }
					if (args[i - 1] === "--slug") return false;
					return true;
				});
				// --slug 없으면 listFiles, 있으면 listFilesBySlug
				const files = listSlug
					? await client(opts).listFilesBySlug(listSlug)
					: (posArgs[0] ? await client(opts).listFilesBySlug(posArgs[0]) : await client(opts).listFiles());
				emit({ count: files.length, files });
				break;
			}

			case "upload": {
				validateKey(opts.key);
				const file = args[0];
				if (!file) fail("Usage: llm file upload <file|-> [name] [--slug <slug>]");
				let slug = "";
				const posArgs = args.filter((a, i) => {
					if (a === "--slug") { slug = args[i + 1] || ""; return false; }
					if (args[i - 1] === "--slug") return false;
					return true;
				});
				const realFile = posArgs[0];
				const explicitName = posArgs[1];
				const fs = await import("node:fs/promises");
				const path = await import("node:path");
				let name: string;
				let data: Buffer;
				if (realFile === "-") {
					const chunks: Buffer[] = [];
					for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
					data = Buffer.concat(chunks);
					name = explicitName || "upload.bin";
				} else {
					const resolved = path.resolve(realFile);
					name = explicitName || path.basename(resolved);
					data = await fs.readFile(resolved);
				}
				const result = await client(opts).uploadFile(name, data, slug);
				emit(result);
				break;
			}

			case "download":
			case "dl": {
				validateKey(opts.key);
				const dlInput = args[0];
				const output = args[1];
				if (!dlInput) fail("Usage: llm file download <url|filename> [output|-]");
				const fileUrl = dlInput.startsWith("/pages/") ? dlInput : `/pages/${dlInput}`;
				const data = await client(opts).downloadFile(fileUrl);
				if (!output || output === "-") {
					process.stdout.write(data);
				} else {
					const fs = await import("node:fs/promises");
					const path = await import("node:path");
					const outPath = path.resolve(output);
					await fs.writeFile(outPath, data);
					emit({ downloaded: outPath, size: data.length });
				}
				break;
			}

			case "delete":
			case "rm": {
				validateKey(opts.key);
				const filename = args[0];
				if (!filename) fail("Usage: llm file delete <filename>");
				await client(opts).deleteFile(filename);
				emit({ deleted: filename });
				break;
			}

			default:
				fail(`Unknown file subcommand: ${sub}. Available: list, upload, download, delete`);
		}
	} catch (e) {
		fail(e instanceof Error ? e.message : String(e));
	}
}
