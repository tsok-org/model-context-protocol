# Model Context Protocol (MCP) — Enterprise Infrastructure

**Production-ready, horizontally scalable TypeScript implementation for building MCP servers and clients**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP Spec](https://img.shields.io/badge/MCP-2025--11--25-green.svg)](https://modelcontextprotocol.io/)
[![Nx](https://img.shields.io/badge/Nx-Monorepo-143055.svg)](https://nx.dev/)

---

## 🎯 Mission

The **Model Context Protocol (MCP)** is revolutionizing how AI agents interact with tools, data, and services. As adoption accelerates, the need for **enterprise-grade infrastructure** becomes critical.

This project provides a complete, production-ready MCP implementation designed from the ground up for:

- **Horizontal scalability** — Run multiple server instances behind load balancers
- **Session persistence** — Maintain client state across restarts and scaling events  
- **Full observability** — Correlate logs, metrics, and traces across distributed systems
- **Protocol compliance** — Wire-compatible with the official MCP SDK
- **Extensibility** — Add custom features without forking core protocol logic

> **Our goal**: Make it easy to build scalable, reliable, and observable MCP servers—from startup MVPs to enterprise deployments.

---

## 🏗️ Architecture

We took a **protocol-first** approach: instead of building high-level abstractions that hide the protocol, we built a **modular, layered architecture** that gives you full control while reducing boilerplate.

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

### Distributed Deployment Architecture

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

---

## 📦 Packages

This monorepo contains a suite of packages for building MCP infrastructure:

### Core Packages

| Package | npm | Description |
|---------|-----|-------------|
| **[model-context-protocol-specification](packages/specification)** | [![npm](https://img.shields.io/npm/v/model-context-protocol-specification)](https://www.npmjs.com/package/model-context-protocol-specification) | Canonical TypeScript types and Zod v4 schemas for all MCP message types. Foundation for type-safe MCP development. |
| **[model-context-protocol-sdk](packages/sdk)** | [![npm](https://img.shields.io/npm/v/model-context-protocol-sdk)](https://www.npmjs.com/package/model-context-protocol-sdk) | Core SDK with Protocol, Server, and Client implementations. Feature-based architecture for tools, resources, prompts, and completions. |
| **[model-context-protocol-framework](packages/framework)** | [![npm](https://img.shields.io/npm/v/model-context-protocol-framework)](https://www.npmjs.com/package/model-context-protocol-framework) | Higher-level abstractions and patterns for common MCP use cases. *(Coming soon)* |

### Transport Packages

| Package | npm | Description |
|---------|-----|-------------|
| **[model-context-protocol-distributed-streamable-http-server-transport](packages/transports/server/distributed-streamable-http)** | [![npm](https://img.shields.io/npm/v/model-context-protocol-distributed-streamable-http-server-transport)](https://www.npmjs.com/package/model-context-protocol-distributed-streamable-http-server-transport) | Enterprise HTTP transport with EventBroker abstraction for horizontal scaling. Supports NATS, Kafka, Redis, or custom brokers. |
| **[model-context-protocol-webrtc-transport](packages/transports/webrtc-transport)** | [![npm](https://img.shields.io/npm/v/model-context-protocol-webrtc-transport)](https://www.npmjs.com/package/model-context-protocol-webrtc-transport) | WebRTC transport for real-time, peer-to-peer MCP connections. *(In development)* |

### Observability

| Package | npm | Description |
|---------|-----|-------------|
| **[model-context-protocol-opentelemetry-instrumentation](packages/opentelemetry/instrumentation)** | [![npm](https://img.shields.io/npm/v/model-context-protocol-opentelemetry-instrumentation)](https://www.npmjs.com/package/model-context-protocol-opentelemetry-instrumentation) | OpenTelemetry instrumentation for automatic tracing, metrics, and log correlation. *(In development)* |

---

## 🔑 Key Design Decisions

### 1. Sessions as First-Class Citizens

In distributed systems, **sessions are everything**. They're your routing key, persistence boundary, and observability anchor.

```typescript
// Every handler receives full session context
tools.registerTool(myTool, async (args, context, info) => {
  const session = context.session;
  
  // Access session state
  const userPrefs = session.getValue<UserPrefs>('preferences');
  
  // Session metadata for observability
  console.log(`[${session.id}] Processing tool call`);
  
  return await processWithSession(args, session);
});
```

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
server.addFeature(new MyCustomFeature());
```

### 3. Transport-Agnostic Design

The protocol layer knows nothing about HTTP, WebSockets, or message brokers:

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

### 4. Explicit Validation with Standard Schema

We don't hide validation—we make it explicit and pluggable:

```typescript
import { StandardSchemaValidator, defaultSchemaResolver } from "model-context-protocol-sdk/protocol";

const server = new Server({
  schemaValidator: new StandardSchemaValidator(),
  schemaResolver: defaultSchemaResolver,
  enforceSchemaValidation: true
});
```

Compatible with Zod v4, Valibot, ArkType, or any Standard Schema-compatible validator.

### 5. Instrumentation-Ready Architecture

Every layer is designed for observability with lifecycle hooks:

- `onBeforeSendRequest` / `onAfterSendRequest`
- `onBeforeSendNotification` / `onAfterSendNotification`  
- `onBeforeReceive` / `onAfterReceive`

---

## 🆚 Comparison with Official SDK

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

## 🚀 Quick Start

### Installation

```bash
npm install model-context-protocol-sdk
# For runtime validation (recommended)
npm install zod @standard-schema/spec
```

### Server Example

```typescript
import { Server, ToolsFeature } from "model-context-protocol-sdk/server";

const server = new Server({
  serverInfo: { name: "my-server", version: "1.0.0" },
  capabilities: { tools: { listChanged: true } },
  instructions: "This server provides utility tools."
});

const tools = new ToolsFeature();

tools.registerTool(
  {
    name: "greet",
    description: "Generate a greeting",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"]
    }
  },
  async (args) => ({
    content: [{ type: "text", text: `Hello, ${(args as any).name}!` }]
  })
);

server.addFeature(tools);
await server.connect(transport);
```

### Client Example

```typescript
import { Client } from "model-context-protocol-sdk/client";

const client = new Client();
await client.connect(transport);

const result = await client.request({
  method: "tools/call",
  params: { name: "greet", arguments: { name: "World" } }
}, { route: { sessionId } });
```

---

## 📁 Repository Structure

```
model-context-protocol/
├── packages/
│   ├── specification/          # Types & Zod schemas
│   ├── sdk/                    # Core Protocol, Server, Client
│   ├── framework/              # High-level abstractions
│   ├── transports/
│   │   ├── server/
│   │   │   └── distributed-streamable-http/
│   │   └── webrtc-transport/
│   └── opentelemetry/
│       └── instrumentation/
├── examples/
│   └── server/                 # Complete example server
├── e2e/
│   └── server/                 # E2E tests with official & our client
├── nx.json                     # Nx workspace config
└── package.json
```

---

## 🧪 Testing & Development

### Prerequisites

- Node.js 20+
- pnpm 9+

### Setup

```bash
pnpm install
```

### Build All Packages

```bash
pnpm nx run-many -t build
```

### Run Tests

```bash
# Unit tests
pnpm nx run-many -t test

# E2E tests (start server first)
pnpm nx serve server  # Terminal 1
pnpm nx test e2e-server  # Terminal 2
```

### Run Example Server

```bash
pnpm nx serve server
# Server runs at http://localhost:3333/mcp
```

---

## 🔬 Our Findings

Through building this implementation, we discovered several insights about MCP in production:

### Session Management is Critical

The MCP spec leaves session management largely to implementers. In distributed systems, this becomes the central challenge. We found that treating sessions as first-class routing keys (rather than transport concerns) dramatically simplifies horizontal scaling.

### Validation at Protocol Boundaries

Protocol boundaries are trust boundaries. While the official SDK offers optional validation, production systems benefit from explicit, always-on validation. Our Standard Schema integration makes this pluggable while maintaining performance.

### Feature Composition > Monolithic Handlers

Large MCP servers with many tools/resources become unwieldy with direct handler registration. Our feature-based architecture enables:
- Testing features in isolation
- Reusing features across servers
- Third-party feature packages

### Transport Abstraction Enables Innovation

By strictly separating transport from protocol, we enabled transports the official SDK doesn't support:
- **Distributed HTTP**: Multiple nodes sharing a message broker
- **WebRTC**: Browser-to-server without HTTP
- **Custom brokers**: NATS, Kafka, Redis Streams, etc.

---

## 🗺️ Roadmap

- [x] Core SDK (Protocol, Server, Client)
- [x] Specification package with Zod v4 schemas
- [x] Distributed Streamable HTTP transport
- [x] E2E test suite with official SDK compatibility
- [ ] OpenTelemetry instrumentation
- [ ] WebRTC transport
- [ ] Framework package with common patterns
- [ ] Stdio transport
- [ ] Authentication middleware examples
- [ ] Kubernetes deployment guides

---

## 🤝 Contributing

We're building this in the open because we believe MCP infrastructure should be a community effort.

- **Issues**: Bug reports, feature requests, questions
- **PRs**: Bug fixes, documentation, new features
- **Discussions**: Architecture decisions, use cases, best practices

---

## 📚 Documentation

- [SDK Documentation](packages/sdk/README.md) — Core SDK guide
- [Distributed Transport](packages/transports/server/distributed-streamable-http/README.md) — Scaling guide
- [Example Server](examples/server/README.md) — Working example
- [E2E Tests](e2e/server/README.md) — Test patterns
- [MCP Specification](https://modelcontextprotocol.io/) — Official protocol docs

---

## 📄 License

This project is fully open-source under the **GNU Affero General Public License v3.0 (AGPLv3)**. See [LICENSE](LICENSE) for the complete terms.

If you're interested in an **enterprise license** with different terms, please contact: **operator@tsok.org**