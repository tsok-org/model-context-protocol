# Model Context Protocol SDK

**A production-ready, enterprise-grade TypeScript SDK for building MCP servers and clients**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP Spec](https://img.shields.io/badge/MCP-2025--11--25-green.svg)](https://modelcontextprotocol.io/)

---

## Why This SDK?

The Model Context Protocol (MCP) is revolutionizing how AI agents interact with tools, data, and services. As adoption grows, the need for **enterprise-grade infrastructure** becomes critical. This SDK was built from the ground up with a clear mission:

> **Make it easy to build scalable, reliable, and observable MCP servers—from startup MVPs to enterprise deployments.**

### The Problem We Solve

The official MCP TypeScript SDK is excellent for getting started quickly. However, as teams scale their MCP deployments, they encounter challenges:

- **Distributed deployments**: Running multiple server instances behind a load balancer
- **Session persistence**: Maintaining client state across server restarts and horizontal scaling
- **Observability**: Correlating logs, metrics, and traces across requests
- **Validation**: Ensuring message integrity at protocol boundaries
- **Extensibility**: Adding custom features without forking the protocol layer

### Our Approach

We took a **protocol-first** approach: instead of building a high-level abstraction that hides the protocol, we built a **modular, layered architecture** that gives you full control while reducing boilerplate.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Your Application                              │
├─────────────────────────────────────────────────────────────────────┤
│  Server/Client Classes  │  Feature System  │  Custom Extensions      │
├─────────────────────────────────────────────────────────────────────┤
│                      Protocol Layer                                  │
│  (Connection management, request/response correlation, lifecycle)    │
├─────────────────────────────────────────────────────────────────────┤
│  Schema Validation (Standard Schema)  │  Session Management          │
├─────────────────────────────────────────────────────────────────────┤
│                      Transport Layer                                 │
│  (Pluggable: HTTP, stdio, distributed brokers, WebRTC, etc.)        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Sessions as First-Class Citizens

In distributed systems, **sessions are everything**. They're your routing key, your persistence boundary, and your observability anchor.

```typescript
// Every handler receives full session context
tools.registerTool(myTool, async (args, context, info) => {
  const session = context.session;
  
  // Access session state
  const userPrefs = session.getValue<UserPrefs>('preferences');
  
  // Session metadata for observability
  console.log(`[${session.id}] Processing tool call`);
  
  // Session-scoped caching, rate limiting, etc.
  return await processWithSession(args, session);
});
```

**Why this matters**: In a distributed deployment, requests may be handled by different server instances. Sessions provide the continuity layer that makes this transparent to your application logic.

### 2. Feature-Based Architecture

Instead of monolithic handlers, we use a **composable feature system**:

```typescript
const server = new Server({
  serverInfo: { name: "my-server", version: "1.0.0" },
  capabilities: {
    tools: { listChanged: true },
    resources: { subscribe: true },
    prompts: {}
  }
});

// Features are self-contained and reusable
server.addFeature(new ToolsFeature(myTools));
server.addFeature(new ResourcesFeature(myResources));
server.addFeature(new PromptsFeature(myPrompts));
server.addFeature(new CompletionFeature(myCompletions));

// Custom features for your domain
server.addFeature(new MyCustomFeature());
```

**Why this matters**: Features encapsulate related functionality (handlers, validation, state). This makes it easy to test features in isolation, reuse them across servers, and extend the protocol without touching core logic.

### 3. Transport-Agnostic Design

The protocol layer knows nothing about HTTP, WebSockets, or message brokers. This separation enables:

```typescript
// Same server logic, different transports
const server = new Server({ /* ... */ });

// Local development with stdio
await server.connect(stdioTransport);

// Production with distributed HTTP
await server.connect(distributedHttpTransport);

// Real-time with WebRTC
await server.connect(webRTCTransport);
```

**Why this matters**: Your business logic shouldn't change when you scale from single-node to distributed. Transport concerns stay in the transport layer.

### 4. Explicit Validation with Standard Schema

We don't hide validation—we make it explicit and pluggable:

```typescript
import { StandardSchemaValidator, defaultSchemaResolver } from "model-context-protocol-sdk/protocol";

const server = new Server({
  // Validate all incoming/outgoing messages
  schemaValidator: new StandardSchemaValidator(),
  schemaResolver: defaultSchemaResolver,
  
  // Fail on missing schemas (strict mode)
  enforceSchemaValidation: true
});
```

The **Standard Schema** interface means you can use:
- Zod v4 schemas (shipped with `model-context-protocol-specification`)
- Valibot, ArkType, or any Standard Schema-compatible validator
- Your own custom schemas for extended methods

**Why this matters**: Protocol boundaries are trust boundaries. Explicit validation catches issues early and documents your contract.

### 5. Instrumentation-Ready Architecture

Every layer is designed for observability:

```typescript
const server = new Server({
  // Structured logging with correlation
  logger: myLogger,
  
  // Custom ID generation for tracing
  id: myIdGenerator,
  
  // Context extension for custom metadata
  context: (baseContext) => ({
    ...baseContext,
    traceId: generateTraceId(),
    spanId: generateSpanId()
  })
});
```

The protocol provides lifecycle hooks for instrumentation:

- `onBeforeSendRequest` / `onAfterSendRequest`
- `onBeforeSendNotification` / `onAfterSendNotification`
- `onBeforeReceive` / `onAfterReceive`

**Why this matters**: In production, you need to trace requests across services, measure latencies, and correlate errors. The SDK is structured to make this straightforward.

---

## Comparison with Official SDK

| Aspect | Official SDK | This SDK |
|--------|--------------|----------|
| **Goal** | Quick start, batteries included | Enterprise scale, full control |
| **Transport** | Bundled transports | Transport interface + plugins |
| **Sessions** | Transport-managed | First-class protocol concept |
| **Validation** | Optional, built-in | Explicit, pluggable (Standard Schema) |
| **Handlers** | Direct method handlers | Feature-based composition |
| **Distributed** | Single-node focus | Distributed-first design |
| **Observability** | Basic callbacks | Structured hooks + correlation |

### When to Use Which

**Use the Official SDK when:**
- Building a quick prototype or demo
- Single-node deployment is sufficient
- You want maximum convenience with minimal configuration

**Use this SDK when:**
- Building production infrastructure
- Planning horizontal scaling
- Need fine-grained control over protocol behavior
- Integrating with existing observability stack
- Building custom transports or extensions

---

## Installation

```bash
npm install model-context-protocol-sdk
```

For runtime validation (recommended):

```bash
npm install zod @standard-schema/spec
```

> **Note**: `model-context-protocol-sdk` depends on `model-context-protocol-specification`, which provides Zod v4 schemas for all MCP message types.

---

## Quick Start

### Server

```typescript
import { Server, ToolsFeature } from "model-context-protocol-sdk/server";

const server = new Server({
  serverInfo: { name: "my-server", version: "1.0.0" },
  capabilities: {
    tools: { listChanged: true }
  },
  instructions: "This server provides utility tools."
});

const tools = new ToolsFeature();

tools.registerTool(
  {
    name: "greet",
    description: "Generate a greeting",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name to greet" }
      },
      required: ["name"]
    }
  },
  async (args) => {
    const { name } = args as { name: string };
    return {
      content: [{ type: "text", text: `Hello, ${name}!` }]
    };
  }
);

server.addFeature(tools);

// Connect to your transport
await server.connect(transport);
```

### Client

```typescript
import { Client } from "model-context-protocol-sdk/client";

const client = new Client();
await client.connect(transport);

// Initialize session
const initResult = await client.request({
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    clientInfo: { name: "my-client", version: "1.0.0" },
    capabilities: {}
  }
}, { route: {} });

// Send initialized notification
await client.notification({
  method: "notifications/initialized",
  params: {}
}, { route: { sessionId } });

// Call tools
const result = await client.request({
  method: "tools/call",
  params: { name: "greet", arguments: { name: "World" } }
}, { route: { sessionId } });
```

---

## Architecture Deep Dive

### The Protocol Layer

At the heart of the SDK is the `Protocol` class—a generic JSON-RPC 2.0 implementation that handles:

- **Request/Response Correlation**: Matches responses to requests using `(connectionId, sessionId, requestId)` tuples
- **Timeout Management**: Configurable timeouts with optional reset on progress
- **Cancellation**: Full support for `notifications/cancelled`
- **Progress**: Stream progress updates via `notifications/progress` and `_meta.progressToken`
- **Multiple Connections**: Single protocol instance can manage multiple transport connections

```typescript
// Protocol is generic over message types
class Protocol<
  TIncomingRequest,
  TIncomingNotification,
  TIncomingResult,
  TOutgoingRequest,
  TOutgoingNotification,
  TOutgoingResult,
  TContext
> {
  // Register handlers for specific methods
  registerHandler<T>(method: string, handler: MessageHandler<T>): void;
  
  // Connect to a transport
  async connect(transport: Transport): Promise<Connection>;
  
  // Send messages with routing
  async send(connection: Connection, message: Message, options: RequestOptions): Promise<Result>;
}
```

### The Feature System

Features implement the `Feature` interface:

```typescript
interface Feature</* type params */> {
  initialize(context: FeatureContext): void;
}

interface FeatureContext {
  registerHandler<T>(method: string, handler: MessageHandler<T>): void;
}
```

Built-in features:

| Feature | Methods Handled |
|---------|-----------------|
| `ToolsFeature` | `tools/list`, `tools/call` |
| `ResourcesFeature` | `resources/list`, `resources/templates/list`, `resources/read` |
| `PromptsFeature` | `prompts/list`, `prompts/get` |
| `CompletionFeature` | `completion/complete` |
| `PingFeature` | `ping` (built-in, always registered) |

### Transport Interface

Transports implement a minimal interface:

```typescript
interface Transport<TIncoming, TContext, TInfo, TOutgoing> {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: TOutgoing, options?: TransportSendOptions): Promise<void>;
  messageHandler?: TransportMessageHandler<TIncoming, TContext, TInfo>;
}
```

This simplicity enables diverse implementations:

- **Stdio**: Process-based communication
- **HTTP Streamable**: MCP's HTTP transport spec
- **Distributed HTTP**: Broker-backed for horizontal scaling
- **WebRTC**: Real-time peer-to-peer
- **Custom**: Your own transport layer

### Session Management

Sessions provide a consistent abstraction for request-scoped state:

```typescript
interface Session {
  readonly id: SessionId;
  readonly state: SessionState;
  
  // Key-value storage
  getValue<T>(key: string): T | undefined;
  setValue<T>(key: string, value: T): void;
  deleteValue(key: string): void;
  
  // Protocol metadata (populated after initialization)
  readonly protocolVersion?: string;
  readonly clientInfo?: Implementation;
  readonly serverInfo?: Implementation;
  readonly clientCapabilities?: ClientCapabilities;
  readonly serverCapabilities?: ServerCapabilities;
  
  // Lifecycle timestamps
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiredAt?: Date;
  readonly deletedAt?: Date;
}
```

---

## Validation

### Enabling Validation

```typescript
import { StandardSchemaValidator, defaultSchemaResolver } from "model-context-protocol-sdk/protocol";

const server = new Server({
  schemaValidator: new StandardSchemaValidator(),
  schemaResolver: defaultSchemaResolver,
  enforceSchemaValidation: true // Fail on missing schemas
});
```

### What Gets Validated

1. **JSON-RPC Envelope**: Always validates the basic structure
2. **MCP Method Conventions**: 
   - Requests must NOT use `notifications/*` methods
   - Notifications MUST use `notifications/*` methods
3. **Request/Response Params**: When schemas are available
4. **Custom Methods**: Add your own schemas

### Adding Custom Schemas

```typescript
import { z } from "zod/v4";
import { createSchemaResolver } from "model-context-protocol-sdk/protocol";

const MyCustomRequest = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.literal("custom/myMethod"),
  params: z.object({
    data: z.string()
  })
});

const customResolver = createSchemaResolver({
  methods: {
    "custom/myMethod": { request: MyCustomRequest }
  }
});
```

---

## Error Handling

The SDK provides structured errors that map to JSON-RPC error codes:

```typescript
import {
  ProtocolError,
  InvalidRequestError,
  MethodNotFoundError,
  InvalidParamsError,
  InternalError,
  RequestTimeoutError,
  ConnectionClosedError
} from "model-context-protocol-sdk/protocol";

// In your handlers
tools.registerTool(myTool, async (args) => {
  if (!isValid(args)) {
    throw new InvalidParamsError("Invalid arguments", { received: args });
  }
  
  // Errors are automatically serialized to JSON-RPC error responses
});
```

---

## Package Exports

The SDK uses subpath exports for tree-shaking and clear boundaries:

```typescript
// Main entry - re-exports everything
import { Server, Client, Protocol } from "model-context-protocol-sdk";

// Server-specific
import { Server, ToolsFeature, ResourcesFeature } from "model-context-protocol-sdk/server";

// Client-specific
import { Client } from "model-context-protocol-sdk/client";

// Protocol layer
import { Protocol, StandardSchemaValidator } from "model-context-protocol-sdk/protocol";

// Host utilities (WIP)
import { /* ... */ } from "model-context-protocol-sdk/host";
```

---

## Ecosystem

This SDK is part of a larger ecosystem:

| Package | Description |
|---------|-------------|
| `model-context-protocol-specification` | Canonical types + Zod schemas |
| `model-context-protocol-sdk` | This package - protocol + server + client |
| `model-context-protocol-distributed-streamable-http-server-transport` | Broker-backed HTTP transport |
| `model-context-protocol-opentelemetry-instrumentation` | OpenTelemetry integration |
| `model-context-protocol-framework` | Higher-level abstractions (coming soon) |

---

## Building & Testing

From the repo root:

```bash
pnpm nx build model-context-protocol-sdk
pnpm nx test model-context-protocol-sdk
```

---

## Contributing

We're building this in the open because we believe MCP infrastructure should be a community effort. Contributions welcome!

- **Issues**: Bug reports, feature requests, questions
- **PRs**: Bug fixes, documentation, new features
- **Discussions**: Architecture decisions, use cases, best practices

---

## License

MIT License - see [LICENSE](../../LICENSE) for details.

---

## Learn More

- [MCP Specification](https://modelcontextprotocol.io/)
- [Example Server](../../examples/server/README.md)
- [Distributed HTTP Transport](../../packages/transports/server/distributed-streamable-http/README.md)
- [E2E Tests](../../e2e/server/README.md)

