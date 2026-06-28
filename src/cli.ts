#!/usr/bin/env node
import "dotenv/config";
import { serveCommand } from "./cli/serve.js";
import { initCommand } from "./cli/init.js";
import { importCommand } from "./cli/import.js";
import { exportCommand } from "./cli/export.js";

const VERSION = "0.0.1";

function help(): void {
	console.log(`bakewiki ${VERSION}

Usage:
  bakewiki init                Initialize project (create DB + admin)
  bakewiki serve               Start HTTP server
  bakewiki import <dir>        Import markdown folder into DB
  bakewiki export <dir>        Export DB to markdown folder
  bakewiki version             Show version
  bakewiki help                Show this help
`);
}

async function main(): Promise<void> {
	const [, , cmd, ...args] = process.argv;

	switch (cmd) {
		case "init":
			await initCommand();
			break;
		case "serve":
			serveCommand();
			break;
		case "import":
			if (!args[0]) {
				console.error("Usage: bakewiki import <dir>");
				process.exit(1);
			}
			await importCommand(args[0]);
			break;
		case "export":
			if (!args[0]) {
				console.error("Usage: bakewiki export <dir>");
				process.exit(1);
			}
			await exportCommand(args[0]);
			break;
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
