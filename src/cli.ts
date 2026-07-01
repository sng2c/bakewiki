#!/usr/bin/env node
import "dotenv/config";
import { serveCommand } from "./cli/serve.js";
import { initCommand } from "./cli/init.js";
import { adminCreateCommand } from "./cli/admin.js";
import { importCommand } from "./cli/import.js";
import { exportCommand } from "./cli/export.js";
import { remoteCommand, extractRemoteOpts } from "./cli/pages.js";
import { llmCommand } from "./cli/llm.js";

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION: string = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8")).version;

function help(): void {
	console.log(`bakewiki ${VERSION}

Usage:
  bakewiki [global options] <command> [command options]

Global options:
  --data <path>    Data directory (required for local commands, env: BAKEWIKI_DATA_DIR)
  --version, -v    Show version
  --help, -h       Show this help

Commands:
  init              Initialize data directory
  admin create      Create admin account
  serve             Start HTTP server
  import <dir>      Import markdown folder into wiki
  export <dir>      Export wiki to markdown folder
  remote <cmd>      Remote page operations
  llm <cmd>         Same as remote but JSON output (LLM-friendly)

Serve options:
  --host <addr>     Bind address (default: 127.0.0.1, env: BAKEWIKI_HOST)
  --port <number>   Port number (default: 3000, env: BAKEWIKI_PORT)

Remote commands:
  list [options]                             List pages
  get <slug> [options]                           Get page content
  create <slug> <file> [options]                 Create/update page
  rename <old> <new> [options]                   Rename page
  delete <slug> [options]                        Delete page
  search <query> [options]                       Search pages
  sitemap [options]                           Show page tree
  health [options]                            Health check
  file <list|upload|delete> [options]            Manage uploaded images

Remote options (before or after subcommand):
  --url <url>     Server URL (default: http://127.0.0.1:3000, env: BAKEWIKI_URL)
  --key <apikey>  API key (or set BAKEWIKI_API_KEY)

LLM commands:
  Same subcommands as remote (list, get, create, rename, patch, delete,
  search, sitemap, health, file). Output is JSON except "get" which
  outputs Markdown with YAML frontmatter. Use "llm help" for JSON help.
`);
}

// Extract global options (--data, --version, --help) from all args and return the subcommand + the rest.
function parseGlobalArgs(args: string[]): { dataDir?: string; cmd?: string; rest: string[] } {
	let dataDir: string | undefined;
	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--data" && args[i + 1]) {
			dataDir = args[++i];
		} else if (args[i] === "--version" || args[i] === "-v") {
			return { cmd: "version", rest: [], dataDir };
		} else if (args[i] === "--help" || args[i] === "-h") {
			return { cmd: "help", rest: [], dataDir };
		} else {
			positional.push(args[i]);
		}
	}

	return { dataDir, cmd: positional[0], rest: positional.slice(1) };
}

// serve subcommand arg parsing: --host <addr>, --port <number>
function parseServeArgs(args: string[]): { port?: number; hostname?: string } {
	let hostname: string | undefined;
	let port: number | undefined;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--host" && args[i + 1]) {
			hostname = args[++i];
		} else if (args[i] === "--port" && args[i + 1]) {
			const n = Number(args[++i]);
			if (!Number.isInteger(n) || n < 1 || n > 65535) {
				console.error("Error: --port must be 1–65535");
				process.exit(1);
			}
			port = n;
		} else {
			console.error(`Unknown serve option: ${args[i]}`);
			process.exit(1);
		}
	}
	return { port, hostname };
}

async function main(): Promise<void> {
	const [, , ...allArgs] = process.argv;
	const { dataDir, cmd, rest } = parseGlobalArgs(allArgs);

	switch (cmd) {
		case "init":
			await initCommand(dataDir);
			break;
		case "admin":
			if (rest[0] === "create") {
				await adminCreateCommand(dataDir);
			} else {
				console.error("Usage: bakewiki --data <path> admin create");
				process.exit(1);
			}
			break;
		case "serve":
			await serveCommand({ ...parseServeArgs(rest), dataDir });
			break;
		case "import":
			if (!rest[0]) {
				console.error("Usage: bakewiki --data <path> import <dir>");
				process.exit(1);
			}
			await importCommand(rest[0], dataDir);
			break;
		case "export":
			if (!rest[0]) {
				console.error("Usage: bakewiki --data <path> export <dir>");
				process.exit(1);
			}
			await exportCommand(rest[0], dataDir);
			break;
		case "remote": {
			const { opts: remoteOpts, rest: remoteRest } = extractRemoteOpts(rest);
			const sub = remoteRest[0];
			if (!sub) {
				console.error("Usage: bakewiki remote [options] <list|get|create|rename|delete|search|sitemap|health|file>");
				process.exit(1);
			}
			await remoteCommand(sub, remoteRest.slice(1), remoteOpts);
			break;
		}
		case "llm": {
			const { opts: llmOpts, rest: llmRest } = extractRemoteOpts(rest);
			const lsub = llmRest[0];
			if (!lsub) {
				console.error("Usage: bakewiki llm [options] <list|get|create|rename|patch|delete|search|sitemap|health|file>");
				process.exit(1);
			}
			await llmCommand(lsub, llmRest.slice(1), llmOpts);
			break;
		}
		case "version":
			console.log(VERSION);
			break;
		case "help":
			help();
			break;
		default:
			if (cmd) console.error(`Unknown command: ${cmd}`);
			help();
			process.exit(cmd ? 1 : 0);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});