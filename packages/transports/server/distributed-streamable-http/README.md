# Distributed Streamable HTTP Server Transport (MCP)

This package implements an MCP **Streamable HTTP** server transport designed for **distributed** and **enterprise** deployments.

It provides:

- A Node.js HTTP server implementing the Streamable HTTP endpoint shape (**POST/GET/DELETE**)
- **Session-centric routing** (via `Mcp-Session-Id`)
- An **EventBroker abstraction** for broker-backed delivery, fan-out, and resumability
- Background notifications and server-initiated requests over a broker-backed SSE channel

This is a transport package: it does not implement MCP semantics by itself. You typically pair it with the SDK `Server`.

---

## What “distributed” means here

This transport is built around the idea that:

- A session is the primary routing and persistence boundary.
- A broker (NATS/Kafka/Redis streams/…) is the “backplane” that connects HTTP edges, workers, and state.

In the current implementation, **POST bodies are delivered to the connected SDK protocol handler in-process**, and responses are **published to / subscribed from the broker** for correlation and streaming.

The topic model also supports a worker-style deployment pattern (request inbound → worker queue group → response outbound). If you adopt that pattern, you’ll implement it using the exported topics and your broker adapter.

---

## Installation

```bash
npm i model-context-protocol-distributed-streamable-http-server-transport
```

You’ll also need:

- `model-context-protocol-sdk` (protocol + server/client)
- A concrete EventBroker implementation (this package defines the interface; you provide the adapter)

---

## HTTP surface

Default endpoint is `/` unless configured.

### POST (client → server)

- Accepts JSON-RPC messages (single or batch)
- Chooses response mode:
	- `application/json` for non-streaming responses
	- `text/event-stream` (SSE) when streaming is appropriate (e.g. certain methods or progress)
- Creates or resumes a session
	- If a new session is created, responds with `Mcp-Session-Id`

### GET (server → client background channel)

- Requires `Accept: text/event-stream`
- Streams **server-initiated** messages (notifications + requests)
- Supports resumability via `Last-Event-ID` (mapped to broker `EventId`)

### DELETE (session termination)

- Requires `Mcp-Session-Id`
- Deletes the server-side session via the configured `SessionManager`

### Health endpoints

- `GET /health` → `200` with `{ status: "healthy" }`
- `GET /readiness` → `200` when listening, otherwise `503`

---

## EventBroker + topics

This package exports typed topics in `src/topics.ts`:

- `RequestOutbound`: `mcp.{sessionId}.{requestId}.outbound`
- `BackgroundOutbound`: `mcp.{sessionId}.bg.outbound`
- `BackgroundInbound`: `mcp.{sessionId}.bg.inbound`

These are the transport’s primary integration points for distributed behavior:

- **Responses to POST** are brokered via `RequestOutbound`.
- **Server notifications** are brokered via `BackgroundOutbound` and streamed on GET.
- **Server-initiated requests** are brokered via `BackgroundInbound` and streamed on GET.

Your EventBroker implementation controls:

- persistence / durability
- delivery semantics (at-most-once vs at-least-once)
- queue groups / consumer groups
- `EventId` format used for `Last-Event-ID` resumability

---

## Sessions as distributed persistence

The transport accepts an optional `SessionManager` (from this package) to back sessions with Redis/DB/etc.

Sessions are used for:

- Associating requests with a client over time
- Storing MCP initialization metadata (protocolVersion, capabilities, etc.)
- Correlating background SSE channels

If no `SessionManager` is configured, the transport creates an ephemeral session ID and uses an in-memory minimal session shape.

---

## Usage: pair with the SDK Server

This is the common “co-located” deployment shape: HTTP transport + MCP server in the same process, with a broker backplane for outbound fan-out and streaming.

For a runnable example that wires everything together, see: [examples/server/README.md](../../../../examples/server/README.md)

```bash
pnpm nx serve server
```

```ts
import { Server } from "model-context-protocol-sdk";
import { ToolsFeature } from "model-context-protocol-sdk/server";

import {
	DistributedStreamableHttpServerTransport
} from "model-context-protocol-distributed-streamable-http-server-transport";

const server = new Server({
	serverInfo: { name: "example", version: "1.0.0" },
	capabilities: { tools: { listChanged: true } }
});

const tools = new ToolsFeature();
tools.registerTool(
	{
		name: "echo",
		description: "Echo input",
		inputSchema: {
			type: "object",
			properties: { text: { type: "string" } },
			required: ["text"]
		}
	},
	async (args: unknown) => ({
		content: [{ type: "text", text: String((args as any)?.text ?? "") }]
	})
);
server.addFeature(tools);

const transport = new DistributedStreamableHttpServerTransport({
	httpServer: {
		port: 3000,
		endpoint: "/mcp"
	},
	eventBroker: myEventBroker,
	sessions: mySessionManager
});

// Protocol.connect() wires transport.messageHandler and calls transport.connect()
await server.connect(transport);
```

---

## Configuration

The transport constructor accepts `DistributedStreamableHttpServerTransportOptions`:

- `httpServer.port` (required)
- `httpServer.host` (optional)
- `httpServer.endpoint` (optional, default `/`)
- `httpServer.middlewares` (optional) – simple middleware chain

`streamableHttp` options:

- `responseTimeoutMs` – timeout while waiting for brokered responses
- `responseModeStrategy` – decide `json` vs `sse` per POST
- `enableBackgroundChannel` – enable/disable GET
- `enableSessionTermination` – enable/disable DELETE

---

## Response modes (JSON vs SSE)

Streamable HTTP allows returning either:

- **JSON** response bodies (simple request/response)
- **SSE** streams (streaming responses + progress notifications)

This transport chooses SSE when:

- the method is known to benefit from streaming (e.g. tool calls / prompt retrieval), or
- the request includes a progress token (`params._meta.progressToken`)

You can override this with `streamableHttp.responseModeStrategy`.

---

## Best practices for production

- Treat the EventBroker as the source of truth for resumability and fan-out.
- Prefer a durable `SessionManager` for multi-node deployments.
- Make `EventId` stable and strictly increasing per (session, stream) so `Last-Event-ID` works as expected.
- Keep POST handlers fast: if you move heavy work off-thread, publish progress updates and use SSE.
- Decide and document your broker delivery semantics (at-least-once implies idempotency).

---

## Build & test (Nx)

From the repo root:

```bash
pnpm nx build model-context-protocol-distributed-streamable-http-server-transport
pnpm nx test model-context-protocol-distributed-streamable-http-server-transport
```

