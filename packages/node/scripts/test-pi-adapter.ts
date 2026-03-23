#!/usr/bin/env node
import { PiAgentAdapter } from '../src/adapters/pi-agent.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDir = join(__dirname, '../test-pi-agent');

const task: Task = {
  id: 'test-task-1',
  meshId: 'test-mesh',
  repoId: 'test-repo',
  subject: 'Create a greeting file',
  description: 'Create a file named "greeting.txt" with the content "Hello from Pi Agent!" using the mesh-edit tool.',
  owner: 'agent-1',
  status: 'pending' as TaskStatus,
  createdAt: Date.now(),
  updatedAt: Date.now()
};

const config = {
  cwd: testDir,
  env: {
    MESH_ID: 'test-mesh',
    MESH_COORDINATOR_URL: 'http://localhost:3000'
  }
};

async function run() {
  const adapter = new PiAgentAdapter('agent-1', config);
  console.log('Running PiAgentAdapter test...');
  try {
    const result = await adapter.execute(task);
    console.log('Result:', result);
  } catch (e) {
    console.error('Error:', e);
  }
}

run();
