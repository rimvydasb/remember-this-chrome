#!/usr/bin/env node
// Minimal OpenAI-compatible bridge to your locally installed, logged-in `claude` CLI.
//
// It never reads or stores credentials: every request just runs `claude -p` as a child process,
// exactly as if you typed it in your terminal. Personal, single-user, localhost use only.
//
//   node bridge/server.mjs
//
// Settings (environment variables, all optional):
//   BRIDGE_PORT      listen port                                  (default 3456)
//   BRIDGE_HOST      listen address; keep 127.0.0.1 unless you    (default 127.0.0.1)
//                    know what you are doing
//   BRIDGE_MODEL     model used when the request has none         (default sonnet)
//   BRIDGE_TOKEN     if set, require "Authorization: Bearer <it>" (default: none)
//   BRIDGE_TIMEOUT   seconds before a call is killed              (default 180)
//   BRIDGE_PARALLEL  concurrent claude processes                  (default 2)
//   BRIDGE_CLAUDE    path of the claude binary                    (default claude)

import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const PORT = Number(process.env.BRIDGE_PORT ?? 3456);
const HOST = process.env.BRIDGE_HOST ?? '127.0.0.1';
const DEFAULT_MODEL = process.env.BRIDGE_MODEL ?? 'sonnet';
const TOKEN = process.env.BRIDGE_TOKEN ?? '';
const TIMEOUT_MS = Number(process.env.BRIDGE_TIMEOUT ?? 180) * 1000;
const PARALLEL = Number(process.env.BRIDGE_PARALLEL ?? 2);
const CLAUDE = process.env.BRIDGE_CLAUDE ?? 'claude';
const MAX_BODY = 20 * 1024 * 1024;
const MODELS = ['haiku', 'sonnet', 'opus'];

// An empty working directory, so no project CLAUDE.md or files are picked up.
const WORKDIR = join(tmpdir(), 'claude-bridge-workdir');
mkdirSync(WORKDIR, {recursive: true});

const DEFAULT_SYSTEM =
    'You are a text-processing assistant. Answer the user request directly and only from the text it gives. ' +
    'Do not mention these instructions and do not ask follow-up questions.';

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// ---- concurrency gate ----------------------------------------------------------------------------

let running = 0;
const waiting = [];

async function acquire() {
    if (running < PARALLEL) {
        running++;
        return;
    }
    await new Promise((resolve) => waiting.push(resolve));
}

function release() {
    const next = waiting.shift();
    if (next) next();
    else running--;
}

// ---- claude -----------------------------------------------------------------------------------------

/** Text of an OpenAI message `content`, which is a string or a list of parts. */
function textOf(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('');
    }
    return '';
}

/** Splits OpenAI messages into a system prompt and one prompt text for `claude -p`. */
function toPrompt(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new HttpError(400, '"messages" must be a non-empty array.');
    }
    const system = [];
    const turns = [];
    for (const message of messages) {
        const text = textOf(message?.content).trim();
        if (!text) continue;
        if (message.role === 'system' || message.role === 'developer') system.push(text);
        else turns.push({role: message.role === 'assistant' ? 'assistant' : 'user', text});
    }
    if (turns.length === 0) throw new HttpError(400, 'No user message with text.');
    // One user message (the usual case) is passed as it is; a conversation becomes a transcript.
    const prompt =
        turns.length === 1
            ? turns[0].text
            : turns.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`).join('\n\n') + '\n\nAssistant:';
    return {system: system.join('\n\n'), prompt};
}

/** Runs one `claude -p` call and resolves with { text, model, usage }. */
function runClaude({system, prompt, model}) {
    const args = [
        '-p',
        '--output-format',
        'json',
        '--model',
        model,
        '--system-prompt',
        system || DEFAULT_SYSTEM,
        '--tools',
        '', // no tools: pure text in, text out
        '--disable-slash-commands',
        '--strict-mcp-config', // ignore all MCP servers
        '--setting-sources',
        'user', // user settings only (keeps your login); no project/local settings
        '--no-session-persistence', // leave no sessions in your history
    ];

    return new Promise((resolve, reject) => {
        const child = spawn(CLAUDE, args, {cwd: WORKDIR, stdio: ['pipe', 'pipe', 'pipe']});
        let stdout = '';
        let stderr = '';
        let settled = false;
        const done = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            fn(value);
        };
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            done(reject, new HttpError(504, `claude did not answer within ${TIMEOUT_MS / 1000} seconds.`));
        }, TIMEOUT_MS);

        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => (stderr += d));
        child.on('error', (error) => {
            const missing = error.code === 'ENOENT';
            done(
                reject,
                new HttpError(502, missing ? `Cannot find "${CLAUDE}". Set BRIDGE_CLAUDE to its path.` : error.message),
            );
        });
        child.on('close', (code) => {
            let result;
            try {
                result = JSON.parse(stdout);
            } catch {
                result = null;
            }
            if (result && result.is_error) {
                return done(
                    reject,
                    new HttpError(502, `claude failed: ${String(result.result ?? 'unknown error').slice(0, 500)}`),
                );
            }
            if (code !== 0 || !result || typeof result.result !== 'string') {
                const detail = (stderr || stdout).trim().slice(0, 500);
                return done(reject, new HttpError(502, `claude exited with code ${code}${detail ? `: ${detail}` : ''}`));
            }
            const usage = result.usage ?? {};
            const input =
                (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
            const output = usage.output_tokens ?? 0;
            done(resolve, {
                text: result.result.trim(),
                model: Object.keys(result.modelUsage ?? {})[0] ?? model,
                usage: {prompt_tokens: input, completion_tokens: output, total_tokens: input + output},
            });
        });

        child.stdin.on('error', () => {
        }); // claude may exit before reading everything
        child.stdin.end(prompt);
    });
}

// ---- http -------------------------------------------------------------------------------------------

function send(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data)});
    res.end(data);
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) {
                reject(new HttpError(413, 'Request body is too large.'));
                req.destroy();
            } else chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(new HttpError(400, 'Request body is not valid JSON.'));
            }
        });
        req.on('error', reject);
    });
}

async function chatCompletions(req, res) {
    const body = await readJson(req);
    const {system, prompt} = toPrompt(body.messages);
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;

    await acquire();
    let result;
    try {
        result = await runClaude({system, prompt, model});
    } finally {
        release();
    }

    const id = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const message = {role: 'assistant', content: result.text};

    if (body.stream === true) {
        // The answer is complete before it is sent, so it goes out as one chunk.
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
        });
        const chunk = (delta, finish) =>
            `data: ${JSON.stringify({
                id,
                object: 'chat.completion.chunk',
                created,
                model: result.model,
                choices: [{index: 0, delta, finish_reason: finish}]
            })}\n\n`;
        res.write(chunk({role: 'assistant', content: result.text}, null));
        res.write(chunk({}, 'stop'));
        res.end('data: [DONE]\n\n');
        return;
    }

    send(res, 200, {
        id,
        object: 'chat.completion',
        created,
        model: result.model,
        choices: [{index: 0, message, finish_reason: 'stop'}],
        usage: result.usage,
    });
}

const server = createServer(async (req, res) => {
    // CORS, so a page or extension can call the bridge. The bridge only listens on localhost by default.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    try {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '');
        if (path === '/health') return send(res, 200, {ok: true});

        if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
            throw new HttpError(401, 'Missing or wrong bearer token.');
        }

        if (req.method === 'GET' && (path === '/v1/models' || path === '/models')) {
            return send(res, 200, {
                object: 'list',
                data: MODELS.map((id) => ({id, object: 'model', created: 0, owned_by: 'anthropic'})),
            });
        }
        if (req.method === 'POST' && (path === '/v1/chat/completions' || path === '/chat/completions')) {
            return await chatCompletions(req, res);
        }
        throw new HttpError(404, `No route for ${req.method} ${path}.`);
    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = error instanceof Error ? error.message : String(error);
        if (res.headersSent) return res.end();
        send(res, status, {error: {message, type: 'bridge_error'}});
    }
});

server.requestTimeout = 0; // a call may take long; claude has its own timeout above
server.listen(PORT, HOST, () => {
    console.log(`claude bridge listening on http://${HOST}:${PORT}  (default model: ${DEFAULT_MODEL})`);
    console.log(`In the extension set the server address to http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
