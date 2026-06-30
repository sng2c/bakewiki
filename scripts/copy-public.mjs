// public/ → dist/public/ 복사 (tsc는 JS를 다루지 않으므로 별도 복사 단계).
// 크로스플랫폼 (cp 없이 Node 만으로).
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "public");
const dest = join(here, "..", "dist", "public");

if (!existsSync(src)) {
	console.error(`copy-public: source not found: ${src}`);
	process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`copy-public: ${src} → ${dest}`);
