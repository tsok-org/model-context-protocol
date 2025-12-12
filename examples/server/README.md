# MCP Example Server

This is a runnable example MCP server used for:

- demonstrating `model-context-protocol-sdk` usage
- local manual testing
- e2e tests in this repo

It uses:

- `model-context-protocol-sdk` (`Server` + feature system)
- `model-context-protocol-distributed-streamable-http-server-transport` for Streamable HTTP
- an in-memory `EventBroker` and in-memory `SessionManager` (good for local + CI)

## Run

```bash
pnpm nx serve server
```

Defaults:

- HTTP: `http://0.0.0.0:3333/mcp`
- Health: `http://0.0.0.0:3333/health`
- Readiness: `http://0.0.0.0:3333/readiness`

## Env

- `MCP_SERVER_HOST` (default `0.0.0.0`)
- `MCP_SERVER_PORT` (default `3333`)
- `MCP_SERVER_ENDPOINT` (default `/mcp`)
- `MCP_STRICT_VALIDATION` (default `false`) – when `true`, missing schemas are treated as errors

## What it exposes

- Tools:
  - `echo`
  - `triggerError`
- Resources:
  - `memory://hello`
- Prompts:
  - `hello`
