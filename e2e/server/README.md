# MCP E2E Test Suite

**End-to-end tests validating MCP server implementations against both our client and the official MCP client**

This test suite ensures our MCP implementation is fully compatible with the official MCP ecosystem while demonstrating the enhanced capabilities of our enterprise SDK.

---

## Why Two Test Suites?

We maintain parallel test suites that verify the same server behavior using different clients:

| Test File | Client Used | Purpose |
|-----------|-------------|---------|
| `client.ours.e2e.spec.ts` | Our SDK client | Validates our client implementation |
| `client.official.e2e.spec.ts` | Official `@modelcontextprotocol/sdk` | Ensures wire-format compatibility |

**Both suites test identical scenarios against the same server**, proving that:
1. Our server speaks correct MCP protocol
2. Our client speaks correct MCP protocol
3. The two implementations are interchangeable

---

## Test Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        E2E Test Suite                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────────┐         ┌──────────────────────────────────┐│
│   │  client.ours.e2e.ts  │         │  client.official.e2e.ts          ││
│   │                      │         │                                   ││
│   │  Uses: Our SDK       │         │  Uses: @modelcontextprotocol/sdk ││
│   │  Client class        │         │  Official Client                  ││
│   └──────────┬───────────┘         └───────────────┬──────────────────┘│
│              │                                      │                    │
│              │    HTTP (Streamable HTTP Spec)       │                    │
│              │                                      │                    │
│              ▼                                      ▼                    │
│   ┌──────────────────────────────────────────────────────────────────┐ │
│   │                    Example Server                                 │ │
│   │                                                                   │ │
│   │  DistributedStreamableHttpServerTransport                        │ │
│   │    + InMemoryEventBroker                                         │ │
│   │    + InMemorySessionManager                                      │ │
│   └──────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Running Tests

### Prerequisites

1. Start the example server:

```bash
# Terminal 1
pnpm nx serve server
```

2. Run the tests:

```bash
# Terminal 2
pnpm nx test e2e-server
```

### Run Specific Suite

```bash
# Only our client tests
pnpm nx test e2e-server -- --testPathPattern="client.ours"

# Only official client tests
pnpm nx test e2e-server -- --testPathPattern="client.official"
```

### Watch Mode

```bash
pnpm nx test e2e-server -- --watch
```

---

## Test Coverage

### Core Protocol

| Test | Description |
|------|-------------|
| `initialize` | Client sends initialize, server responds with capabilities |
| `initialized` | Client sends initialized notification |
| Session management | Sessions persist across requests |

### Tools

| Test | Description |
|------|-------------|
| `tools/list` | Retrieves available tools |
| `tools/call` (echo) | Calls the echo tool with input |
| `tools/call` (triggerError) | Verifies error handling |

### Resources

| Test | Description |
|------|-------------|
| `resources/list` | Retrieves available resources |
| `resources/read` | Reads resource content by URI |

### Prompts

| Test | Description |
|------|-------------|
| `prompts/list` | Retrieves available prompts |
| `prompts/get` | Gets prompt with arguments |

---

## Custom Transport Implementation

The test suite includes a custom `JsonOnlyStreamableHttpClientTransport` that:

1. **Avoids SSE complexity** - Uses pure JSON responses
2. **Mirrors server expectations** - Sets correct headers
3. **Handles sessions** - Manages `Mcp-Session-Id` header

### Why a Custom Transport?

The official SDK's HTTP transport expects SSE (Server-Sent Events) responses. Our server supports both:
- **JSON responses** (Accept: application/json)
- **SSE streams** (Accept: text/event-stream)

For simpler testing, we use JSON-only mode:

```typescript
// From streamable-http-client-transport.ts
export class JsonOnlyStreamableHttpClientTransport implements Transport {
  private _baseUrl: URL;
  private _sessionId?: string;
  
  async send(message: JSONRPCMessage): Promise<void> {
    const response = await fetch(this._baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",  // Request JSON, not SSE
        ...(this._sessionId && { "Mcp-Session-Id": this._sessionId })
      },
      body: JSON.stringify(message)
    });
    
    // Extract session ID from response headers
    const sessionId = response.headers.get("Mcp-Session-Id");
    if (sessionId) this._sessionId = sessionId;
    
    // Parse and dispatch response
    const json = await response.json();
    this.onmessage?.({ data: json });
  }
}
```

---

## Test File Walkthrough

### client.ours.e2e.spec.ts

Tests using our SDK's `Client` class:

```typescript
import { Client } from "model-context-protocol-sdk/client";
import { JsonOnlyStreamableHttpClientTransport } from "./streamable-http-client-transport";

describe("MCP Server with Our Client", () => {
  let client: Client;
  let transport: JsonOnlyStreamableHttpClientTransport;
  
  beforeAll(async () => {
    transport = new JsonOnlyStreamableHttpClientTransport("http://localhost:3333/mcp");
    client = new Client({
      name: "test-client",
      version: "1.0.0"
    });
    await client.connect(transport);
  });
  
  afterAll(async () => {
    await client.close();
  });
  
  it("should list tools", async () => {
    const result = await client.request("tools/list", {});
    expect(result.tools).toBeDefined();
    expect(result.tools.length).toBeGreaterThan(0);
  });
  
  it("should call echo tool", async () => {
    const result = await client.request("tools/call", {
      name: "echo",
      arguments: { text: "Hello!" }
    });
    expect(result.content[0].text).toBe("Hello!");
  });
});
```

### client.official.e2e.spec.ts

Tests using the official `@modelcontextprotocol/sdk`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

describe("MCP Server with Official Client", () => {
  let client: Client;
  let transport: StreamableHTTPClientTransport;
  
  beforeAll(async () => {
    transport = new StreamableHTTPClientTransport(new URL("http://localhost:3333/mcp"));
    client = new Client({
      name: "official-test-client",
      version: "1.0.0"
    }, {
      capabilities: {}
    });
    await client.connect(transport);
  });
  
  afterAll(async () => {
    await client.close();
  });
  
  it("should list tools", async () => {
    const result = await client.listTools();
    expect(result.tools).toBeDefined();
    expect(result.tools.length).toBeGreaterThan(0);
  });
  
  it("should call echo tool", async () => {
    const result = await client.callTool({
      name: "echo",
      arguments: { text: "Hello!" }
    });
    expect(result.content[0].text).toBe("Hello!");
  });
});
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_SERVER_URL` | `http://localhost:3333/mcp` | Server URL to test against |
| `TEST_TIMEOUT` | `30000` | Jest timeout in ms |

### Jest Configuration

```typescript
// jest.config.ts
export default {
  displayName: "e2e-server",
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  testTimeout: 30000,
  setupFilesAfterEnv: ["./src/test-setup.ts"]
};
```

---

## Debugging Tests

### Verbose Output

```bash
pnpm nx test e2e-server -- --verbose
```

### Single Test

```bash
pnpm nx test e2e-server -- --testNamePattern="should list tools"
```

### Debug Mode

```bash
# In VS Code, use the Debug configuration or:
node --inspect-brk node_modules/.bin/jest --runInBand --testPathPattern="e2e-server"
```

### Check Server Logs

Watch the server terminal for incoming requests and any errors.

---

## Adding New Tests

### Test a New Tool

```typescript
it("should call the new calculateSum tool", async () => {
  const result = await client.request("tools/call", {
    name: "calculateSum",
    arguments: { a: 5, b: 3 }
  });
  
  expect(result.content).toBeDefined();
  expect(result.content[0].type).toBe("text");
  expect(result.content[0].text).toBe("8");
});
```

### Test Error Handling

```typescript
it("should return error for unknown tool", async () => {
  await expect(
    client.request("tools/call", {
      name: "nonexistent",
      arguments: {}
    })
  ).rejects.toThrow();
});
```

### Test Resource Templates

```typescript
it("should read dynamic resource", async () => {
  const result = await client.request("resources/read", {
    uri: "config://app.settings"
  });
  
  expect(result.contents).toBeDefined();
  expect(result.contents[0].uri).toBe("config://app.settings");
});
```

---

## Project Structure

```
e2e/server/
├── src/
│   ├── client.ours.e2e.spec.ts          # Tests with our SDK client
│   ├── client.official.e2e.spec.ts      # Tests with official client
│   ├── streamable-http-client-transport.ts  # Custom JSON-only transport
│   ├── test-setup.ts                    # Jest setup
│   └── utils/                           # Test utilities
├── jest.config.ts                       # Jest configuration
├── package.json                         # Dependencies
├── project.json                         # Nx project config
├── tsconfig.json                        # TypeScript config
├── tsconfig.spec.json                   # Test TypeScript config
└── README.md                            # This file
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      
      - run: pnpm install
      
      - name: Start Server
        run: pnpm nx serve server &
        
      - name: Wait for Server
        run: |
          for i in {1..30}; do
            curl -s http://localhost:3333/health && break
            sleep 1
          done
      
      - name: Run E2E Tests
        run: pnpm nx test e2e-server
```

---

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:3333
```

**Solution**: Make sure the example server is running:

```bash
pnpm nx serve server
```

### Session Not Found

```
Error: Session not found
```

**Solution**: Check that your transport properly sends the `Mcp-Session-Id` header.

### Timeout Errors

```
Timeout - Async callback was not invoked within the 30000 ms timeout
```

**Solution**: 
- Increase timeout: `jest.setTimeout(60000)`
- Check server logs for errors
- Verify server is responding to health checks

### Version Mismatch

```
Error: Protocol version mismatch
```

**Solution**: Ensure client and server use compatible protocol versions. Check `protocolVersion` in initialize params.

---

## Related Documentation

- [Example Server README](../../examples/server/README.md) - Server implementation
- [SDK README](../../packages/sdk/README.md) - SDK documentation
- [Transport README](../../packages/transports/server/distributed-streamable-http/README.md) - Transport docs
- [MCP Specification](https://modelcontextprotocol.io/) - Official protocol

---

## License

MIT License - see [LICENSE](../../LICENSE) for details.
