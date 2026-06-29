#!/usr/bin/env node
import "dotenv/config";
import { serveCommand } from "./cli/serve.js";
import { initCommand } from "./cli/init.js";
import { adminCreateCommand } from "./cli/admin.js";
import { importCommand } from "./cli/import.js";
import { exportCommand } from "./cli/export.js";
import { remoteCommand } from "./cli/pages.js";

const VERSION = "0.0.4";

function help(): void {
	console.log(`bakewiki ${VERSION}

Usage:
  bakewiki init --data <path>               Initialize data directory
  bakewiki admin create --data <path>        Create admin account
  bakewiki serve --data <path> [options]    Start HTTP server
  bakewiki import <dir> --data <path>       Import markdown folder into wiki
  bakewiki export <dir> --data <path>       Export wiki to markdown folder
  bakewiki remote <cmd> [args] --key <key>  Remote page operations
  bakewiki version                           Show version
  bakewiki help                              Show this help

Common options:
  --data <path>   Data directory (required, or set BAKEWIKI_DATA_DIR)

Serve options:
  --host <addr>    Bind address (default: 127.0.0.1, env: BAKEWIKI_HOST)
  --port <number>   Port number (default: 3000, env: BAKEWIKI_PORT)

Remote commands:
  remote list [--url <url>] --key <key>             List pages
  remote get <slug> [--url <url>] --key <key>       Get page content
  remote create <slug> <file> [--url <url>] --key   Create/update page
  remote rename <old> <new> [--url <url>] --key      Rename page
  remote delete <slug> [--url <url>] --key           Delete page
  remote search <query> [--url <url>] --key          Search pages
  remote sitemap [--url <url>] --key              Show page tree
  remote health [--url <url>]                  Health check

Remote options:
  --url <url>     Server URL (default: http://127.0.0.1:3000, env: BAKEWIKI_URL)
  --key <apikey>  API key (or set BAKEWIKI_API_KEY)
`);
}

// --data 플래그를 args에서 추출. 나머지 인수를 반환.
function extractData(args: string[]): { dataDir?: string; rest: string[] } {
	const rest: string[] = [];
	let dataDir: string | undefined;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--data" && args[i + 1]) {
			dataDir = args[++i];
		} else {
			rest.push(args[i]);
		}
	}
	return { dataDir, rest };
}

// serve 서브커맨드 인자 파싱: --host <addr>, --port <number>
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
	const [, , cmd, ...allArgs] = process.argv;
	const { dataDir, rest } = extractData(allArgs);

	switch (cmd) {
		case "init":
			await initCommand(dataDir);
			break;
		case "admin":
			if (rest[0] === "create") {
				await adminCreateCommand(dataDir);
			} else {
				console.error("Usage: bakewiki admin create --data <path>");
				process.exit(1);
			}
			break;
		case "serve":
			await serveCommand({ ...parseServeArgs(rest), dataDir });
			break;
		case "import":
			if (!rest[0]) {
				console.error("Usage: bakewiki import <dir> --data <path>");
				process.exit(1);
			}
			await importCommand(rest[0], dataDir);
			break;
		case "export":
			if (!rest[0]) {
				console.error("Usage: bakewiki export <dir> --data <path>");
				process.exit(1);
			}
			await exportCommand(rest[0], dataDir);
			break;
		case "remote": {
			const sub = rest[0];
			if (!sub) {
				console.error("Usage: bakewiki remote <list|get|create|rename|delete> [args] --key <key>");
				process.exit(1);
			}
			await remoteCommand(sub, rest.slice(1));
			break;
		}
		case "version":
		case "-v":
		case "--version":
			console.log(VERSION);
			break;
		case "help":
		case "-h":
		case "--help":
		case undefined:
			help();
			break;
		default:
			console.error(`Unknown command: ${cmd}`);
			help();
			process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});