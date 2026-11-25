# Claude bridge

A stand-alone, dependency-free Node script (`server.mjs`) that exposes your locally installed and logged-in `claude` CLI as an OpenAI-compatible server. It needs only Node 18+ and `claude`.

```sh
node bridge/server.mjs
```

Then give any OpenAI-compatible client the address `http://127.0.0.1:3456`.

- `POST /v1/chat/completions` (also `"stream": true`, sent as one chunk)
- `GET /v1/models` (`haiku`, `sonnet`, `opus`)
- `GET /health`

Every request runs `claude -p` as a child process with tools, MCP servers, slash commands, project settings and session saving switched off, so it is plain text in, text out. The bridge never reads or stores your login. Use it for yourself on your own machine only.

| Variable          | Default     | Meaning                                               |
| ----------------- | ----------- | ----------------------------------------------------- |
| `BRIDGE_PORT`     | `3456`      | Listen port                                           |
| `BRIDGE_HOST`     | `127.0.0.1` | Listen address (keep it local)                        |
| `BRIDGE_MODEL`    | `sonnet`    | Model when the request names none (`haiku` is faster) |
| `BRIDGE_TOKEN`    | none        | Require `Authorization: Bearer <token>`               |
| `BRIDGE_TIMEOUT`  | `180`       | Seconds before a call is killed                       |
| `BRIDGE_PARALLEL` | `2`         | Concurrent `claude` processes                         |
| `BRIDGE_CLAUDE`   | `claude`    | Path of the `claude` binary                           |

Quick test:

```sh
curl http://127.0.0.1:3456/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Say hi in 3 words."}]}'
```
