#!/usr/bin/env node
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

async function run() {
  let input = "";
  process.stdin.on("data", data => { input += data; });
  process.stdin.on("end", () => {
    const prompt = input.toString();
    
    const fileMatch = prompt.match(/FILE:\s*([^\s\n]+)/);
    const contentMatch = prompt.match(/CONTENT:\s*([\s\S]+)$|CONTENT:\s*([\s\S]+)\n\[/);
    
    if (fileMatch && (contentMatch?.[1] || contentMatch?.[2])) {
      const path = fileMatch[1].trim();
      const content = (contentMatch[1] || contentMatch[2]).trim();
      
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
        console.log(`SUCCESS: Agent performed autonomous write to ${path}`);
      } catch (e) {
        console.error(`ERROR: ${e.message}`);
        process.exit(1);
      }
    } else {
      console.log("ACK: Command received but no valid file operation detected.");
    }
  });
}
run();
