// Build: compile the TypeScript, copy the static files, and generate the service
// worker's precache manifest.
//
// The manifest holds a hash of everything in dist/, so a deploy that changes any file
// also changes the service worker's cache name. That is what makes browsers pick up
// new versions and drop old caches.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}`);
    console.error("Is TypeScript installed? Try: npm install");
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

rmSync(dist, { recursive: true, force: true });
run("tsc", ["-p", "tsconfig.json"]);
run("tsc", ["-p", "tsconfig.sw.json"]);
cpSync(join(root, "public"), dist, { recursive: true });

// sw.js and its manifest are fetched by the browser's own update check, not cached by us.
const skip = new Set(["sw.js", "precache-manifest.js"]);
const files = listFiles(dist)
  .map((path) => relative(dist, path).split(sep).join("/"))
  .filter((file) => !skip.has(file) && !file.startsWith("."))
  .sort();

const hash = createHash("sha256");
for (const file of files) {
  hash.update(`${file}\0`);
  hash.update(readFileSync(join(dist, file)));
  hash.update("\0");
}
const version = hash.digest("hex").slice(0, 12);

// "./" is the page itself (index.html served at the folder URL).
const urls = ["./", ...files.map((file) => `./${file}`)];
writeFileSync(join(dist, "precache-manifest.js"), `self.PRECACHE = ${JSON.stringify({ version, urls }, null, 2)};\n`);

console.log(`Built dist/ (${files.length} files, cache version ${version})`);
