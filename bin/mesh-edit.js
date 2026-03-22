#!/usr/bin/env node
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { execSync } from "node:child_process";

const [,, cmd, ...args] = process.argv;
const params = Object.fromEntries(args.map(a => {
  const i = a.indexOf('=');
  if (i === -1) return [a, ""];
  return [a.slice(0, i), a.slice(i + 1)];
}));

function log(msg) { console.log(`SUCCESS: ${msg}`); }
function error(msg) { console.error(`ERROR: ${msg}`); process.exit(1); }

async function run() {
  try {
    switch (cmd) {
      case "read":
        if (!params.path) error("path required");
        process.stdout.write(readFileSync(params.path, "utf-8"));
        break;
      case "write":
        if (!params.path) error("path required");
        mkdirSync(dirname(params.path), { recursive: true });
        writeFileSync(params.path, params.content || "");
        log(`Wrote to ${params.path}`);
        break;
      case "edit":
        if (!params.path || !params.old || !params.new) error("path, old, new required");
        const content = readFileSync(params.path, "utf-8");
        if (!content.includes(params.old)) error("old string not found");
        const next = content.replace(params.old, params.new);
        writeFileSync(params.path, next);
        log(`Updated ${params.path}`);
        break;
      case "git-status":
        const status = execSync("git status --short", { encoding: "utf-8" });
        process.stdout.write(status || "Clean\n");
        break;
      case "git-commit":
        if (!params.message) error("message required");
        const cwd = params.cwd || process.cwd();
        execSync(`git add -A`, { cwd });
        execSync(`git commit -m "${params.message}" --no-verify`, { cwd });
        log(`Committed: ${params.message}`);
        break;
      default:
        error(`Unknown command: ${cmd}`);
    }
  } catch (e) {
    error(e.message);
  }
}
run();
