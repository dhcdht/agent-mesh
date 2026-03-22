#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const API = process.env.MESH_COORDINATOR_URL || "http://localhost:3000";
const MESH_ID = process.env.MESH_ID || "agent-mesh-dev";

async function sendMessage(from, text) {
  try {
    await fetch(`${API}/api/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: randomUUID(),
        meshId: MESH_ID,
        from,
        to: "*",
        type: "message",
        payload: { text }
      })
    });
  } catch (e) {}
}

async function run() {
  let input = "";
  process.stdin.on("data", data => { input += data; });
  process.stdin.on("end", async () => {
    const prompt = input.toString();
    const agentId = prompt.match(/You are ([^\s.]+)/)?.[1] || "agent-node";
    
    const fileMatch = prompt.match(/FILE:\s*([^\s\n]+)/);
    const contentMatch = prompt.match(/CONTENT:\s*([\s\S]+)$|CONTENT:\s*([\s\S]+)\n\[/);
    
    if (fileMatch && (contentMatch?.[1] || contentMatch?.[2])) {
      const path = fileMatch[1].trim();
      const content = (contentMatch[1] || contentMatch[2]).trim();
      
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
        const msg = `SUCCESS: 我已自主完成了文件写入：${path}`;
        console.log(msg);
        await sendMessage(agentId, msg);
      } catch (e) {
        const errorMsg = `ERROR: 写入失败：${e.message}`;
        console.error(errorMsg);
        await sendMessage(agentId, errorMsg);
        process.exit(1);
      }
    } else {
      const ack = "ACK: 指令已收到，正在执行相应逻辑。";
      console.log(ack);
      await sendMessage(agentId, ack);
    }
  });
}
run();
