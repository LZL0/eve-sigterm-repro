// Starts a fake model server, runs the built agent, sends one turn, then SIGTERM.
// Usage: node repro.mjs [--runtime bun|node] [--no-tool] [--idle]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { Client } from 'eve/client';

const runtime = process.argv.includes('--runtime') ? process.argv[process.argv.indexOf('--runtime') + 1] : 'bun';
const useTool = !process.argv.includes('--no-tool');
const idle = process.argv.includes('--idle');
const entry = path.resolve('.output/server/index.mjs');
if (!fs.existsSync(entry)) throw new Error('Run the build first.');

const chunk = (model, delta, finish) => `data: ${JSON.stringify({ id: 'fake', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
const fake = http.createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const body = JSON.parse(raw || '{}');
  if (req.url === '/note') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  // Call the tool once, then reply with text.
  const sawResult = JSON.stringify(body.messages).includes('"ok":true') || JSON.stringify(body.messages).includes('\\"ok\\":true');
  const callTool = useTool && !sawResult;
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write(callTool
    ? chunk(body.model, { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'post_note', arguments: '{"text":"hello"}' } }] }, null)
    : chunk(body.model, { content: 'done' }, null));
  res.end(chunk(body.model, {}, callTool ? 'tool_calls' : 'stop').replace('"choices"', '"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15},"choices"') + 'data: [DONE]\n\n');
});
fake.listen(0, '127.0.0.1');
await once(fake, 'listening');
const fakeUrl = `http://127.0.0.1:${fake.address().port}`;

const probe = net.createServer().listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const url = `http://127.0.0.1:${port}`;
const token = 'repro-token';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-sigterm-repro-'));
const child = spawn(runtime, [entry], {
  cwd: work,
  env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1', PORT: String(port), NITRO_PORT: String(port), WORKFLOW_LOCAL_BASE_URL: url, FAKE_URL: fakeUrl, REPRO_TOKEN: token },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const exited = once(child, 'exit');

for (let i = 0; ; i++) {
  if (i > 300) throw new Error('The runtime did not become ready.');
  try { if ((await fetch(`${url}/eve/v1/health`)).ok) break; } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
}
console.log(`repro: ${runtime} runtime ready, eve ${JSON.parse(fs.readFileSync('node_modules/eve/package.json', 'utf8')).version}, ${idle ? 'idle (no turn)' : useTool ? 'turn with a tool call' : 'turn without a tool call'}`);

if (!idle) {
  const client = new Client({ baseUrl: url, auth: { bearer: token } });
  const { delivery } = await client.sessions.create({ message: 'Post a note that says hello.' });
  const result = await delivery.result({ signal: AbortSignal.timeout(30_000) });
  console.log(`repro: turn ${result.status}, reply ${JSON.stringify(result.reply)}`);
}
await new Promise((resolve) => setTimeout(resolve, 1000));

const sent = Date.now();
console.log('repro: sending SIGTERM');
child.kill('SIGTERM');
const outcome = await Promise.race([exited.then(() => 'exited'), new Promise((resolve) => setTimeout(() => resolve('hung'), 30_000))]);
if (outcome === 'exited') console.log(`repro: OK, exited ${Date.now() - sent} ms after SIGTERM`);
else {
  console.log('repro: BUG, still running 30 s after SIGTERM; sending SIGKILL');
  child.kill('SIGKILL');
  await exited;
}
fake.close();
fs.rmSync(work, { recursive: true, force: true });
process.exit(outcome === 'exited' ? 0 : 1);
