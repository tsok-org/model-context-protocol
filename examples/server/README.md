# MCP Example Server

**A complete, runnable example demonstrating the MCP SDK in action**

This example server showcases how to build an MCP server using our enterprise-grade SDK and distributed HTTP transport. It serves as:

- 📚 **Learning resource** for understanding MCP server development
- 🧪 **Test target** for the E2E test suite
- 🚀 **Starting point** for your own MCP server

---

## Quick Start

```bash
# From repository root
pnpm nx serve server
```

The server starts at:
- **MCP Endpoint**: `http://localhost:3333/mcp`
- **Health Check**: `http://localhost:3333/health`
- **Readiness**: `http://localhost:3333/readiness`

---

## What's Included

### Tools

| Tool | Description |
|------|-------------|
| `echo` | Returns the input text as-is. Great for testing round-trips. |
| `triggerError` | Always returns an error result. Useful for testing error handling. |

### Resources

| Resource | URI | Description |
|----------|-----|-------------|
| `hello` | `memory://hello` | A simple in-memory resource with static text. |

### Prompts

| Prompt | Description |
|--------|-------------|
| `hello` | A greeting prompt that accepts an optional `name` argument. |

---

## Architecture

This example demonstrates the complete stack:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           main.ts                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  Server (model-context-protocol-sdk)                                     │
│    ├── ToolsFeature      (echo, triggerError)                           │
│    ├── ResourcesFeature  (memory://hello)                               │
│    └── PromptsFeature    (hello)                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  DistributedStreamableHttpServerTransport                               │
│    ├── InMemoryEventBroker                                              │
│    └── InMemorySessionManager                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Components

#### Server Setup

```typescript
import { Server, ToolsFeature, ResourcesFeature, PromptsFeature } from "model-context-protocol-sdk/server";
import { StandardSchemaValidator, defaultSchemaResolver } from "model-context-protocol-sdk/protocol";

const server = new Server({
  serverInfo: { name: "mcp-example-server", version: "0.1.0" },
  capabilities: {
    tools: { listChanged: true },
    resources: { subscribe: false, listChanged: true },
    prompts: { listChanged: true }
  },
  instructions: "Example MCP server built with model-context-protocol-sdk",
  
  // Optional: Enable runtime validation
  schemaValidator: new StandardSchemaValidator(),
  schemaResolver: defaultSchemaResolver,
  enforceSchemaValidation: config.strictValidation
});
```

#### Tool Registration

```typescript
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
```

#### Resource Registration

```typescript
const resources = new ResourcesFeature();

resources.registerResource(
  {
    uri: "memory://hello",
    name: "hello",
    description: "A tiny in-memory resource"
  },
  async () => ({
    contents: [{
      uri: "memory://hello",
      mimeType: "text/plain",
      text: "Hello from the MCP example server"
    }]
  })
);

server.addFeature(resources);
```

#### Transport Configuration

```typescript
import {
  DistributedStreamableHttpServerTransport
} from "model-context-protocol-distributed-streamable-http-server-transport";
import { InMemoryEventBroker } from "./lib/event-broker/memory";
import { InMemorySessionManager } from "./lib/session-manager/memory";

const transport = new DistributedStreamableHttpServerTransport({
  httpServer: {
    port: config.port,
    host: config.host,
    endpoint: config.endpoint
  },
  eventBroker: new InMemoryEventBroker(),
  sessions: new InMemorySessionManager()
});

await server.connect(transport);
```

---

## Configuration

Configure via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_SERVER_HOST` | `0.0.0.0` | Host to bind to |
| `MCP_SERVER_PORT` | `3333` | Port to listen on |
| `MCP_SERVER_ENDPOINT` | `/mcp` | MCP endpoint path |
| `MCP_STRICT_VALIDATION` | `false` | Fail on missing schemas |

Example:

```bash
MCP_SERVER_PORT=8080 MCP_STRICT_VALIDATION=true pnpm nx serve server
```

---

## Testing with curl

### Initialize a Session

```bash
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "clientInfo": { "name": "curl-client", "version": "1.0.0" },
      "capabilities": {}
    }
  }'
```

Note the `Mcp-Session-Id` header in the response.

### Send Initialized Notification

```bash
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized",
    "params": {}
  }'
```

### List Tools

```bash
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### Call a Tool

```bash
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "echo",
      "arguments": { "text": "Hello, MCP!" }
    }
  }'
```

### Read a Resource

```bash
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "resources/read",
    "params": { "uri": "memory://hello" }
  }'
```

### Get a Prompt

```bash
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "prompts/get",
    "params": { "name": "hello", "arguments": { "name": "World" } }
  }'
```

---

## In-Memory Implementations

This example includes reference implementations for local development:

### InMemoryEventBroker

A simple event broker that:
- Stores messages in memory with sequence IDs
- Supports NATS-style wildcard matching (`*`, `>`)
- Implements queue groups for load balancing
- Supports replay from sequence ID (for SSE resumability)

See: `src/lib/event-broker/memory.ts`

### InMemorySessionManager

A simple session manager that:
- Generates UUID session IDs
- Stores session data in memory
- Supports CRUD operations

See: `src/lib/session-manager/memory.ts`

> **Note**: For production, replace these with persistent implementations (Redis, NATS, Kafka, etc.)

---

## Running E2E Tests

The E2E tests in `e2e/server/` use this example server as the test target:

```bash
# Start the server (in one terminal)
pnpm nx serve server

# Run tests (in another terminal)
pnpm nx test e2e-server
```

Tests verify:
- Both our SDK client and the official MCP client can connect
- Tools, resources, and prompts work correctly
- Session management functions properly

---

## Docker

Build and run with Docker:

```bash
# Build
docker build -t mcp-example-server -f examples/server/Dockerfile .

# Run
docker run -p 3333:3333 mcp-example-server
```

---

## Extending This Example

### Adding a New Tool

```typescript
tools.registerTool(
  {
    name: "calculate",
    description: "Perform arithmetic calculation",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["add", "subtract", "multiply", "divide"] },
        a: { type: "number" },
        b: { type: "number" }
      },
      required: ["operation", "a", "b"]
    }
  },
  async (args: unknown) => {
    const { operation, a, b } = args as { operation: string; a: number; b: number };
    let result: number;
    
    switch (operation) {
      case "add": result = a + b; break;
      case "subtract": result = a - b; break;
      case "multiply": result = a * b; break;
      case "divide": result = a / b; break;
      default: throw new Error(`Unknown operation: ${operation}`);
    }
    
    return { content: [{ type: "text", text: String(result) }] };
  }
);
```

### Adding a Dynamic Resource

```typescript
resources.registerTemplate(
  {
    uriTemplate: "file://{path}",
    name: "File System",
    description: "Access files from the file system"
  },
  async (uri) => {
    const path = uri.replace("file://", "");
    const content = await fs.readFile(path, "utf-8");
    return {
      contents: [{ uri, mimeType: "text/plain", text: content }]
    };
  }
);
```

### Adding Authentication Middleware

```typescript
const authMiddleware: Middleware = async (req, res, next) => {
  const token = req.headers["authorization"]?.replace("Bearer ", "");
  
  if (!token || !isValidToken(token)) {
    res.statusCode = 401;
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null
    }));
    return;
  }
  
  await next();
};

const transport = new DistributedStreamableHttpServerTransport({
  httpServer: {
    port: 3333,
    endpoint: "/mcp",
    middlewares: [authMiddleware]
  },
  // ...
});
```

---

## Project Structure

```
examples/server/
├── src/
│   ├── main.ts                 # Entry point, server setup
│   ├── lib/
│   │   ├── config.ts           # Environment configuration
│   │   ├── logger.ts           # Console logger
│   │   ├── event-broker/
│   │   │   └── memory.ts       # In-memory EventBroker
│   │   └── session-manager/
│   │       └── memory.ts       # In-memory SessionManager
│   └── assets/
│       └── .gitkeep
├── Dockerfile                  # Container build
├── project.json                # Nx project config
├── tsconfig.json               # TypeScript config
└── README.md                   # This file
```

---

## Related Documentation

- [SDK README](../../packages/sdk/README.md) - Core SDK documentation
- [Transport README](../../packages/transports/server/distributed-streamable-http/README.md) - Transport documentation
- [E2E Tests README](../../e2e/server/README.md) - Test documentation
- [MCP Specification](https://modelcontextprotocol.io/) - Official protocol docs

---

## License

MIT License - see [LICENSE](../../LICENSE) for details.
