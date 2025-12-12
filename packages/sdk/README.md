# Model Context Protocol SDK (TypeScript)

This package provides a TypeScript SDK for building **MCP clients and servers** with a strong emphasis on:

- **Spec compliance** (MCP + JSON-RPC 2.0 envelopes)
- **End-to-end runtime validation** (via the Standard Schema interface)
- **Transport-agnostic architecture** (stdio, HTTP, distributed brokers, …)
- **Enterprise-grade operability** (sessions, correlation, structured hooks, and room for instrumentation)

If you’re new to MCP, start with the official docs: https://modelcontextprotocol.io/

---

## Packages & layering

This repo intentionally separates concerns:

- `model-context-protocol-specification`
	- Canonical protocol types and **Zod v4 runtime schemas**.
	- Runtime schemas implement the **Standard Schema** interface so they can be consumed by any Standard-Schema validator.

- `model-context-protocol-sdk` (this package)
	- Protocol engine (request/response correlation, cancellation, progress, lifecycle)
	- High-level `Client` and `Server` classes
	- Feature system (tools/resources/prompts/…)
	- Pluggable validation via Standard Schema (`schemaResolver` + `schemaValidator`)
	- Transport interface(s) used by servers/clients

This split makes it easier to:

- Version and publish “the spec” separately from “the implementation”
- Swap validators (Zod/Valibot/ArkType/…) without rewriting the SDK
- Keep runtime validation aligned across clients, servers, and transports

---

## How this compares to the official MCP ecosystem

The official MCP TypeScript SDK focuses on a high-level developer experience and bundles a set of default transports and patterns.

This SDK is compatible with the MCP model (JSON-RPC + lifecycle + standard method conventions), but is optimized for:

- **Hard validation on send/receive**: the protocol layer can validate every message *before it leaves* and *as it arrives*.
- **Pluggable schemas**: Standard Schema lets you use Zod v4 schemas from `model-context-protocol-specification`, but also lets you bring your own validator.
- **Distributed transports**: this repo includes transports designed to work in multi-node environments (see the distributed Streamable HTTP transport).

In practice: if you want “batteries-included examples”, use the official SDK. If you want “protocol-first building blocks” and explicit control over validation + routing + sessions in distributed deployments, this SDK is the foundation.

---

## Installation

### npm

```bash
npm i model-context-protocol-sdk
```

Runtime validation (recommended) requires:

```bash
npm i zod @standard-schema/spec
```

Notes:

- `model-context-protocol-sdk` depends on `model-context-protocol-specification`.
- `model-context-protocol-specification` declares `zod@^4` as a peer dependency.

---

## Quick start: a minimal server

The SDK includes a high-level `Server` class and a feature system.

For a runnable end-to-end example (used for e2e in this repo), see the example app: [examples/server/README.md](../../examples/server/README.md)

Run it from the repo root:

```bash
pnpm nx serve server
```

```ts
import { Server } from "model-context-protocol-sdk";
import { ToolsFeature } from "model-context-protocol-sdk/server";

const server = new Server({
	serverInfo: { name: "example-server", version: "1.0.0" },
	capabilities: {
		tools: { listChanged: true }
	},
	instructions: "Example MCP server"
});

const tools = new ToolsFeature();
tools.registerTool(
	{
		name: "echo",
		description: "Echo input back as text",
		inputSchema: {
			type: "object",
			properties: { text: { type: "string" } },
			required: ["text"]
		}
	},
	async (args: unknown) => {
		const text = (args as { text?: string }).text ?? "";
		return { content: [{ type: "text", text }] };
	}
);

server.addFeature(tools);

// Connect the server to a transport.
// (In this repo you can use the distributed Streamable HTTP server transport.)
```

---

## Quick start: a minimal client

The SDK also includes a `Client` class.

```ts
import { Client } from "model-context-protocol-sdk";

const client = new Client();

// await client.connect(transport);

// Example request shape:
// await client.request({ method: "tools/list", params: {} }, { route: { sessionId: "..." } });
```

The client API is intentionally explicit: you send MCP JSON-RPC requests and get typed results back.

---

## Runtime validation (Standard Schema)

This SDK can enforce invariants and validate payload shapes:

- Always validates the JSON-RPC envelope when validation is enabled
- Enforces MCP method conventions:
	- Requests MUST NOT use `notifications/*`
	- Notifications MUST use `notifications/*`
- Can validate request/notification params and response/result shapes via a schema resolver

### Enabling strict validation

```ts
import { Server } from "model-context-protocol-sdk";
import { StandardSchemaValidator, defaultSchemaResolver } from "model-context-protocol-sdk/protocol";

const server = new Server({
	schemaValidator: new StandardSchemaValidator(),
	schemaResolver: defaultSchemaResolver,
	enforceSchemaValidation: true
});
```

What you get:

- Outgoing messages are validated before sending
- Incoming messages are validated before dispatch
- Responses/errors are validated using the originating request method (tracked per pending request)

### Extending schemas for custom methods

If you introduce non-standard methods (e.g. `acme/foo`), you can add schemas by building a registry and resolver.

```ts
import { z } from "zod/v4";
import { createSchemaResolver, StandardSchemaValidator } from "model-context-protocol-sdk/protocol";

const AcmeFooRequest = z.object({
	jsonrpc: z.literal("2.0"),
	id: z.union([z.string(), z.number()]),
	method: z.literal("acme/foo"),
	params: z.object({ value: z.number() })
});

const resolver = createSchemaResolver({
	methods: {
		"acme/foo": { request: AcmeFooRequest }
	}
});

// Then configure schemaValidator + schemaResolver on Client/Server/Protocol.
```

---

## Sessions, correlation, cancellation, and progress

The protocol engine provides:

- **Request/response correlation** keyed by `(connectionId, sessionId, requestId)`
- **Cancellation** via `notifications/cancelled`
- **Progress** via `notifications/progress` and `_meta.progressToken`

In distributed deployments, the **session** becomes your primary boundary for:

- Routing (which client is this?)
- Persistence (what state must survive across nodes?)
- Observability (tie logs/metrics/traces to a session)

---

## Instrumentation-ready design

This SDK is structured so that instrumentation can be added without forking protocol logic:

- A pluggable logger interface is available in protocol options
- Clear lifecycle hooks exist in the protocol pipeline (before/after send/receive)
- Session and connection IDs are consistently present for correlation

---

## Status of the `host` module

The `model-context-protocol-sdk/host` export is currently a placeholder.
Treat it as **work-in-progress** until real host-side APIs are implemented.

---

## Building & testing (Nx)

From the repo root:

```bash
pnpm nx build model-context-protocol-sdk
pnpm nx test model-context-protocol-sdk
```

