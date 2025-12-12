# Distributed Streamable HTTP Server Transport

**Enterprise-grade MCP transport for horizontally scalable deployments**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP Spec](https://img.shields.io/badge/MCP-2025--11--25-green.svg)](https://modelcontextprotocol.io/)

---

## What This Transport Does

This package implements the **MCP Streamable HTTP** transport specification with a critical difference: it's designed for **distributed deployments** from day one.

In a typical MCP setup, your server runs on a single node. This works great for development and small-scale production. But what happens when you need to:

- Run multiple server instances behind a load balancer?
- Handle thousands of concurrent client sessions?
- Survive server restarts without losing session state?
- Deploy across multiple regions?

This is where the **Distributed Streamable HTTP Transport** shines.

---

## The Architecture

```
                                    ┌─────────────────────────────────┐
                                    │         Load Balancer           │
                                    └─────────────┬───────────────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    │                             │                             │
           ┌────────▼────────┐           ┌────────▼────────┐           ┌────────▼────────┐
           │   HTTP Node 1   │           │   HTTP Node 2   │           │   HTTP Node 3   │
           │   (Transport)   │           │   (Transport)   │           │   (Transport)   │
           └────────┬────────┘           └────────┬────────┘           └────────┬────────┘
                    │                             │                             │
                    └─────────────────────────────┼─────────────────────────────┘
                                                  │
                                    ┌─────────────▼───────────────────┐
                                    │         EventBroker             │
                                    │   (NATS / Kafka / Redis / ...)  │
                                    └─────────────┬───────────────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    │                             │                             │
           ┌────────▼────────┐           ┌────────▼────────┐           ┌────────▼────────┐
           │    Worker 1     │           │    Worker 2     │           │    Worker 3     │
           │  (MCP Handler)  │           │  (MCP Handler)  │           │  (MCP Handler)  │
           └─────────────────┘           └─────────────────┘           └─────────────────┘
```

### Key Concepts

#### Sessions as Routing Keys

Every MCP connection is identified by a **session ID** (the `Mcp-Session-Id` header). In distributed mode, this session ID becomes the routing key for all messages:

- Messages are published to session-scoped topics
- Workers subscribe to specific sessions or use queue groups for load balancing
- Session state can be persisted externally (Redis, database, etc.)

#### EventBroker as the Backplane

The **EventBroker** interface abstracts your messaging infrastructure. Whether you use NATS JetStream, Kafka, Redis Streams, or something else, the transport doesn't care—it just publishes and subscribes.

```typescript
interface EventBroker {
  publish<TParams, TData>(
    topic: Topic<TParams, TData>,
    params: TParams,
    data: TData
  ): Promise<EventId>;
  
  subscribe<TParams, TData>(
    topic: Topic<TParams, TData>,
    params: TParams,
    options?: SubscriptionOptions
  ): Subscription<TData>;
  
  close(): Promise<void>;
}
```

#### Typed Topic System

Topics are defined with TypeScript types that enforce compile-time safety:

```typescript
// Request-scoped: mcp.{sessionId}.{requestId}.{direction}
const RequestInbound: Topic<RequestScopeParams, JSONRPCMessage>;
const RequestOutbound: Topic<RequestScopeParams, JSONRPCMessage>;

// Session-scoped: mcp.{sessionId}.bg.{direction}
const BackgroundOutbound: Topic<SessionScopeParams, JSONRPCMessage>;
const BackgroundInbound: Topic<SessionScopeParams, JSONRPCMessage>;
```

---

## How It Works

### POST Request Flow (Client → Server)

1. Client sends HTTP POST to `/mcp` with JSON-RPC request
2. Transport extracts/creates session ID
3. Transport subscribes to `RequestOutbound` for this specific request
4. Transport delivers message to protocol layer via `messageHandler`
5. Protocol processes request and publishes response to `RequestOutbound`
6. Transport receives response via subscription
7. Transport sends HTTP response (JSON or SSE stream)

### GET Request Flow (Background Channel)

1. Client opens SSE stream via HTTP GET to `/mcp`
2. Transport validates session ID from header
3. Transport subscribes to `BackgroundOutbound` and `BackgroundInbound`
4. Server publishes notifications/requests to background topics
5. Transport streams messages to client via SSE
6. Supports `Last-Event-ID` for resumability

### DELETE Request Flow (Session Termination)

1. Client sends HTTP DELETE to `/mcp` with session ID
2. Transport validates session
3. Transport calls `SessionManager.delete()`
4. Session and associated resources are cleaned up

---

## Installation

```bash
npm install model-context-protocol-distributed-streamable-http-server-transport
```

You'll also need:

- `model-context-protocol-sdk` for protocol + server
- An EventBroker implementation (this package provides the interface)
- Optionally, a SessionManager implementation

---

## Quick Start

### Basic Setup

```typescript
import { Server, ToolsFeature } from "model-context-protocol-sdk/server";
import {
  DistributedStreamableHttpServerTransport
} from "model-context-protocol-distributed-streamable-http-server-transport";
import { InMemoryEventBroker } from "./my-event-broker";
import { InMemorySessionManager } from "./my-session-manager";

// Create MCP server with tools
const server = new Server({
  serverInfo: { name: "my-distributed-server", version: "1.0.0" },
  capabilities: { tools: { listChanged: true } }
});

const tools = new ToolsFeature();
tools.registerTool(
  { name: "echo", description: "Echo input", inputSchema: { type: "object" } },
  async (args) => ({
    content: [{ type: "text", text: String((args as any)?.text ?? "") }]
  })
);
server.addFeature(tools);

// Create transport with broker and session manager
const transport = new DistributedStreamableHttpServerTransport({
  httpServer: {
    port: 3000,
    endpoint: "/mcp"
  },
  eventBroker: new InMemoryEventBroker(),
  sessions: new InMemorySessionManager()
});

// Connect and start
await server.connect(transport);
console.log("Server running at http://localhost:3000/mcp");
```

### Production Setup with NATS

```typescript
import { connect, NatsConnection } from "nats";

class NatsEventBroker implements EventBroker {
  private nc: NatsConnection;
  private js: JetStreamClient;
  
  async connect() {
    this.nc = await connect({ servers: "nats://localhost:4222" });
    this.js = this.nc.jetstream();
  }
  
  async publish<TParams, TData>(
    topic: Topic<TParams, TData>,
    params: TParams,
    data: TData
  ): Promise<EventId> {
    const subject = topic.subject(params);
    const ack = await this.js.publish(subject, JSON.stringify(data));
    return String(ack.seq);
  }
  
  subscribe<TParams, TData>(
    topic: Topic<TParams, TData>,
    params: TParams,
    options?: SubscriptionOptions
  ): Subscription<TData> {
    // Implementation with NATS JetStream consumer
  }
  
  async close() {
    await this.nc.close();
  }
}

// Use in transport
const transport = new DistributedStreamableHttpServerTransport({
  httpServer: { port: 3000, endpoint: "/mcp" },
  eventBroker: new NatsEventBroker(),
  sessions: new RedisSessionManager()
});
```

---

## Configuration

### Transport Options

```typescript
interface DistributedStreamableHttpServerTransportOptions {
  httpServer: {
    port: number;                    // Required: port to listen on
    host?: string;                   // Default: 0.0.0.0
    endpoint?: string;               // Default: /
    middlewares?: Middleware[];      // Express-style middleware chain
  };
  
  streamableHttp?: {
    responseTimeoutMs?: number;      // Default: 30000
    responseModeStrategy?: ResponseModeStrategy;
    enableBackgroundChannel?: boolean;  // Default: true
    enableSessionTermination?: boolean; // Default: true
  };
  
  eventBroker: EventBroker;          // Required: message broker
  sessions?: SessionManager;          // Optional: session persistence
}
```

### Response Mode Strategy

Control whether POST responses use JSON or SSE:

```typescript
const customStrategy: ResponseModeStrategy = (messages, session) => {
  // Default: SSE for tools/call, sampling/createMessage, prompts/get
  // or when progressToken is present
  
  // Custom: always use SSE for certain sessions
  if (session?.getValue("preferStreaming")) {
    return "sse";
  }
  
  return "json";
};

const transport = new DistributedStreamableHttpServerTransport({
  // ...
  streamableHttp: {
    responseModeStrategy: customStrategy
  }
});
```

---

## Topic Model Deep Dive

### Subject Patterns

All topics follow a consistent naming convention:

```
mcp.{sessionId}.{scope}.{direction}
```

- **sessionId**: UUID or custom session identifier
- **scope**: Either a `requestId` or `bg` (background)
- **direction**: `inbound` (to handlers) or `outbound` (to client)

### Message Flow Examples

#### Tool Call

```
Client POST (tools/call, id=req1, session=abc)
    │
    ▼
Transport subscribes: mcp.abc.req1.outbound
    │
    ▼
Transport delivers to protocol messageHandler
    │
    ▼
Protocol processes, handler executes
    │
    ▼
Protocol publishes result: mcp.abc.req1.outbound
    │
    ▼
Transport receives via subscription
    │
    ▼
Transport sends HTTP response to client
```

#### Server Notification

```
Server calls transport.send(notification)
    │
    ▼
Transport publishes: mcp.abc.bg.outbound
    │
    ▼
Client's GET SSE stream receives via subscription
    │
    ▼
SSE event sent to client
```

#### Server Request (e.g., sampling/createMessage)

```
Server publishes request: mcp.abc.bg.inbound
    │
    ▼
Client's GET SSE stream receives
    │
    ▼
Client sends response via POST
    │
    ▼
Normal request/response flow
```

---

## Session Management

### SessionManager Interface

```typescript
interface SessionManager {
  create(request: SessionRequest): Session;
  get(sessionId: string, request: SessionRequest): Session | undefined;
  delete(sessionId: string, request: SessionRequest): void;
}

interface Session {
  readonly id: string;
  getValue<T>(key: string): T | undefined;
  setValue<T>(key: string, value: T): void;
  deleteValue(key: string): void;
}
```

### Session Lifecycle

1. **Creation**: On first POST (initialize request) without session ID
2. **Retrieval**: On subsequent requests with `Mcp-Session-Id` header
3. **Deletion**: On DELETE request or TTL expiration

### Persistence Strategies

| Strategy | Pros | Cons | Use Case |
|----------|------|------|----------|
| In-memory | Fast, simple | Lost on restart | Development, testing |
| Redis | Fast, distributed | Extra infrastructure | Production, scaling |
| Database | Durable, queryable | Slower, complexity | Compliance, auditing |

---

## Health Endpoints

The transport exposes health endpoints outside the MCP path:

```
GET /health    → 200 { status: "healthy" }
GET /readiness → 200 { status: "ready" } or 503 { status: "not ready" }
```

Use these for Kubernetes probes, load balancer health checks, etc.

---

## Middleware Support

Add middleware for logging, authentication, CORS, etc.:

```typescript
const loggingMiddleware: Middleware = async (req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  await next();
};

const authMiddleware: Middleware = async (req, res, next) => {
  const token = req.headers["authorization"];
  if (!validateToken(token)) {
    res.statusCode = 401;
    res.end("Unauthorized");
    return;
  }
  await next();
};

const transport = new DistributedStreamableHttpServerTransport({
  httpServer: {
    port: 3000,
    endpoint: "/mcp",
    middlewares: [loggingMiddleware, authMiddleware]
  },
  // ...
});
```

---

## SSE Resumability

The transport supports reconnection with `Last-Event-ID`:

1. Each SSE event includes a broker-assigned `id` (EventId)
2. Client stores the last received ID
3. On reconnection, client sends `Last-Event-ID` header
4. Transport passes this to broker subscription
5. Broker replays missed messages

**Broker Requirements**: Your EventBroker must support `fromEventId` in subscription options for replay.

---

## Deployment Patterns

### Pattern 1: Colocated (Simple)

Protocol handler runs in the same process as HTTP transport:

```typescript
const server = new Server({ /* ... */ });
const transport = new DistributedStreamableHttpServerTransport({ /* ... */ });
await server.connect(transport);
```

Best for: Development, small deployments

### Pattern 2: Distributed Workers

HTTP transport and protocol handlers are separate:

```typescript
// HTTP Node (Transport)
const transport = new DistributedStreamableHttpServerTransport({
  httpServer: { port: 3000, endpoint: "/mcp" },
  eventBroker: natsBroker
});
// No server.connect() - transport only receives and routes

// Worker Node (Handler)
const subscription = broker.subscribe(RequestInbound, { sessionId: "*" }, {
  queueGroup: "mcp-workers"
});

for await (const msg of subscription) {
  const result = await processRequest(msg.data);
  await broker.publish(RequestOutbound, { sessionId, requestId }, result);
  await msg.ack();
}
```

Best for: High throughput, isolation, scaling workers independently

### Pattern 3: Regional Deployment

Deploy transport nodes in each region, share broker and session store:

```
US-West                    US-East                    EU-West
┌──────────┐              ┌──────────┐              ┌──────────┐
│Transport │              │Transport │              │Transport │
│  Node    │              │  Node    │              │  Node    │
└────┬─────┘              └────┬─────┘              └────┬─────┘
     │                         │                         │
     └─────────────────────────┼─────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Global Broker     │
                    │   (NATS Global)     │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Session Store     │
                    │ (Redis Cluster)     │
                    └─────────────────────┘
```

Best for: Global low-latency, disaster recovery

---

## Best Practices

### EventBroker Implementation

1. **Delivery Semantics**: Document whether your broker provides at-most-once or at-least-once delivery
2. **EventId Stability**: Use monotonically increasing IDs for SSE resumability
3. **Queue Groups**: Use them for worker load balancing
4. **Message Ordering**: Ensure per-session ordering if your use case requires it

### Session Management

1. **TTL**: Set reasonable session expiration to clean up abandoned sessions
2. **External Store**: Use Redis/database for production deployments
3. **Session Data**: Keep session data small; use references to external storage for large objects

### Monitoring

1. **Connection Metrics**: Track active SSE connections per node
2. **Message Latency**: Measure publish-to-receive time through broker
3. **Error Rates**: Monitor handler errors, timeouts, broker failures
4. **Session Lifecycle**: Track creation, usage, expiration

---

## Building & Testing

From the repo root:

```bash
pnpm nx build model-context-protocol-distributed-streamable-http-server-transport
pnpm nx test model-context-protocol-distributed-streamable-http-server-transport
```

---

## API Reference

### Classes

- `DistributedStreamableHttpServerTransport` - Main transport class

### Interfaces

- `EventBroker` - Message broker abstraction
- `SessionManager` - Session persistence abstraction
- `Session` - Session state container
- `Topic<TParams, TData>` - Typed topic definition
- `Subscription<TData>` - Async iterable message stream
- `BrokerMessage<TData>` - Message wrapper with ack/nack

### Topics

- `RequestInbound` - Client requests to handlers
- `RequestOutbound` - Handler responses to transport
- `BackgroundOutbound` - Server notifications to clients
- `BackgroundInbound` - Server requests to clients
- `SessionWildcard` - All messages for a session (debugging)

---

## Related Packages

- [model-context-protocol-sdk](../../sdk/README.md) - Protocol + server + client
- [Example Server](../../../../examples/server/README.md) - Working example
- [E2E Tests](../../../../e2e/server/README.md) - Integration tests

---

## License

MIT License - see [LICENSE](../../../../LICENSE) for details.

