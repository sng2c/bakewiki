import { defineConfig } from "drizzle-kit";
import path from "node:path";
import os from "node:os";

function resolveDbPath(): string {
	const fromEnv = process.env.BAKEWIKI_DB_PATH;
	if (fromEnv) return fromEnv;
	return path.join(os.homedir(), ".bakewiki", "data", "bakewiki.db");
}

export default defineConfig({
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
	dbCredentials: {
		url: resolveDbPath(),
	},
});
