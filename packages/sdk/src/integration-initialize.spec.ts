/**
 * Initialize Flow Integration Tests
 *
 * Tests for the MCP initialize/initialized lifecycle between Client and Server.
 *
 * The MCP initialization flow:
 * 1. Client sends `initialize` request with protocolVersion, capabilities, clientInfo
 * 2. Server responds with `InitializeResult` containing negotiated version, capabilities, serverInfo
 * 3. Client sends `notifications/initialized` notification
 * 4. Session is now ready for normal operations
 */

import { Client } from "./client/client";
import { Server } from "./server/server";
import type { Transport, IncomingMessageContext, IncomingMessageInfo, TransportMessageHandler } from "./protocol/transport";
import type { Context, Session, SessionState, RequestOptions } from "./protocol/types";
import {
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  type JSONRPCRequest,
  type JSONRPCNotification,
  type JSONRPCResponse,
  type JSONRPCResultResponse,
  type ClientRequest,
  type ClientNotification,
  type ServerRequest,
  type ServerNotification,
  type InitializeRequest,
  type InitializeResult,
  type InitializedNotification
} from "./protocol/schema";
import type { ClientResponse, ServerResponse } from "./client/types";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a mock session for testing.
 */
function createMockSession(id: string): Session {
  const storage = new Map<string, unknown>();
  return {
    id,
    state: "active" as SessionState,
    getValue: <T>(key: string) => storage.get(key) as T | undefined,
    setValue: <T>(key: string, value: T) => {
      storage.set(key, value);
    },
    deleteValue: (key: string) => {
      storage.delete(key);
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// =============================================================================
// In-Memory Transport
// =============================================================================

/**
 * A simple in-memory transport for testing.
 * Messages are passed directly to the peer transport.
 */
class InMemoryTransport<
  TIncoming extends JSONRPCRequest | JSONRPCNotification | JSONRPCResponse,
  TOutgoing extends JSONRPCRequest | JSONRPCNotification | JSONRPCResponse
> implements Transport<TIncoming, IncomingMessageContext<Context>, IncomingMessageInfo, TOutgoing> {
  private _peer?: InMemoryTransport<TOutgoing, TIncoming>;
  private _connected = false;

  messageHandler?: TransportMessageHandler<TIncoming, IncomingMessageContext<Context>, IncomingMessageInfo>;

  /**
   * Links two transports together so they can communicate.
   */
  static createPair<
    TA extends JSONRPCRequest | JSONRPCNotification | JSONRPCResponse,
    TB extends JSONRPCRequest | JSONRPCNotification | JSONRPCResponse
  >(): [InMemoryTransport<TA, TB>, InMemoryTransport<TB, TA>] {
    const transportA = new InMemoryTransport<TA, TB>();
    const transportB = new InMemoryTransport<TB, TA>();
    transportA._peer = transportB;
    transportB._peer = transportA;
    return [transportA, transportB];
  }

  async connect(): Promise<void> {
    this._connected = true;
  }

  async send(message: TOutgoing, options?: { sessionId?: string }): Promise<void> {
    if (!this._connected) {
      throw new Error("Transport not connected");
    }
    if (!this._peer) {
      throw new Error("No peer transport linked");
    }

    // Simulate async message delivery
    await Promise.resolve();

    // Deliver message to peer's handler
    if (this._peer.messageHandler) {
      const context: IncomingMessageContext<Context> = {
        instanceId: "test-instance",
        session: options?.sessionId ? createMockSession(options.sessionId) : undefined
      };
      const info: IncomingMessageInfo = {
        timestamp: new Date()
      };
      await this._peer.messageHandler(message as never, context, info);
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }
}

// =============================================================================
// Transport Type Aliases
// =============================================================================

type ServerTransportIncoming = ClientRequest | ClientNotification | ServerResponse;
type ServerTransportOutgoing = ServerRequest | ServerNotification | ClientResponse;
type ClientTransportIncoming = ServerRequest | ServerNotification | ClientResponse;
type ClientTransportOutgoing = ClientRequest | ClientNotification | ServerResponse;

// =============================================================================
// Tests
// =============================================================================

describe("Initialize Flow Integration", () => {
  let server: Server;
  let client: Client;
  let serverTransport: InMemoryTransport<ServerTransportIncoming, ServerTransportOutgoing>;
  let clientTransport: InMemoryTransport<ClientTransportIncoming, ClientTransportOutgoing>;

  beforeEach(() => {
    // Create linked transports
    [clientTransport, serverTransport] = InMemoryTransport.createPair<ClientTransportIncoming, ServerTransportIncoming>();
  });

  afterEach(async () => {
    await server?.close();
    await client?.close();
  });

  describe("initialize request", () => {
    it("should complete initialize handshake with correct response structure", async () => {
      // Create server with specific options
      server = new Server({
        serverInfo: {
          name: "test-server",
          version: "1.0.0"
        },
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true }
        },
        instructions: "This is a test server"
      });

      client = new Client();

      // Connect both sides
      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Send initialize request
      const initializeRequest: InitializeRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "initialize",
        id: "init-1",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {
            roots: { listChanged: true }
          },
          clientInfo: {
            name: "test-client",
            version: "1.0.0"
          }
        }
      };

      const response = (await client.send(clientConnection, initializeRequest, options)) as JSONRPCResultResponse<InitializeResult>;

      // Verify response structure
      expect(response).toBeDefined();
      expect(response.jsonrpc).toBe(JSONRPC_VERSION);
      expect(response.id).toBe("init-1");
      expect(response.result).toBeDefined();

      // Verify InitializeResult contents
      const result = response.result;
      expect(result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
      expect(result.serverInfo).toEqual({
        name: "test-server",
        version: "1.0.0"
      });
      expect(result.capabilities).toEqual({
        tools: { listChanged: true },
        resources: { subscribe: true }
      });
      expect(result.instructions).toBe("This is a test server");
    });

    it("should negotiate protocol version when client sends supported version", async () => {
      server = new Server({
        serverInfo: { name: "test-server", version: "1.0.0" },
        capabilities: {}
      });

      client = new Client();

      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      const initializeRequest: InitializeRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "initialize",
        id: "init-2",
        params: {
          protocolVersion: "2025-11-25", // Supported version
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" }
        }
      };

      const response = (await client.send(clientConnection, initializeRequest, options)) as JSONRPCResultResponse<InitializeResult>;

      // Server should accept the client's version
      expect(response.result.protocolVersion).toBe("2025-11-25");
    });

    it("should fallback to latest version when client sends unsupported version", async () => {
      server = new Server({
        serverInfo: { name: "test-server", version: "1.0.0" },
        capabilities: {}
      });

      client = new Client();

      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      const initializeRequest: InitializeRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "initialize",
        id: "init-3",
        params: {
          protocolVersion: "2020-01-01", // Unsupported version
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" }
        }
      };

      const response = (await client.send(clientConnection, initializeRequest, options)) as JSONRPCResultResponse<InitializeResult>;

      // Server should fallback to latest supported version
      expect(response.result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
    });

    it("should call onInitialize callback with client info", async () => {
      const onInitializeMock = jest.fn();

      server = new Server({
        serverInfo: { name: "test-server", version: "1.0.0" },
        capabilities: {},
        onInitialize: onInitializeMock
      });

      client = new Client();

      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      const initializeRequest: InitializeRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "initialize",
        id: "init-4",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: { sampling: {} },
          clientInfo: { name: "my-client", version: "2.0.0" }
        }
      };

      await client.send(clientConnection, initializeRequest, options);

      // Verify callback was called with correct data
      expect(onInitializeMock).toHaveBeenCalledTimes(1);
      expect(onInitializeMock).toHaveBeenCalledWith(
        {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          clientInfo: { name: "my-client", version: "2.0.0" },
          clientCapabilities: { sampling: {} }
        },
        expect.anything() // session
      );
    });
  });

  describe("initialized notification", () => {
    it("should complete full initialize flow with initialized notification", async () => {
      const onReadyMock = jest.fn();

      server = new Server({
        serverInfo: { name: "test-server", version: "1.0.0" },
        capabilities: {},
        onReady: onReadyMock
      });

      client = new Client();

      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Step 1: Send initialize request
      const initializeRequest: InitializeRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "initialize",
        id: "init-5",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" }
        }
      };

      const initResponse = (await client.send(clientConnection, initializeRequest, options)) as JSONRPCResultResponse<InitializeResult>;
      expect(initResponse.result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);

      // Step 2: Send initialized notification
      const initializedNotification: InitializedNotification = {
        jsonrpc: JSONRPC_VERSION,
        method: "notifications/initialized"
      };

      // Notifications don't return a response
      await client.send(clientConnection, initializedNotification, options);

      // Give the notification time to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify onReady callback was called
      expect(onReadyMock).toHaveBeenCalledTimes(1);
    });

    it("should allow ping after initialization is complete", async () => {
      server = new Server({
        serverInfo: { name: "test-server", version: "1.0.0" },
        capabilities: {}
      });

      client = new Client();

      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Complete initialization flow
      const initializeRequest: InitializeRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "initialize",
        id: "init-6",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" }
        }
      };

      await client.send(clientConnection, initializeRequest, options);

      const initializedNotification: InitializedNotification = {
        jsonrpc: JSONRPC_VERSION,
        method: "notifications/initialized"
      };

      await client.send(clientConnection, initializedNotification, options);

      // Now ping should work
      await expect(client.ping(options)).resolves.toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should reject initialize request missing params", async () => {
      server = new Server({
        serverInfo: { name: "test-server", version: "1.0.0" },
        capabilities: {}
      });

      client = new Client();

      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Send malformed initialize request (missing params)
      const badRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "initialize",
        id: "bad-init"
        // params intentionally missing
      } as InitializeRequest;

      await expect(client.send(clientConnection, badRequest, options)).rejects.toThrow();
    });

    it("should reject initialize request missing protocolVersion", async () => {
      server = new Server({
        serverInfo: { name: "test-server", version: "1.0.0" },
        capabilities: {}
      });

      client = new Client();

      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Send initialize request missing protocolVersion
      const badRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "initialize",
        id: "bad-init-2",
        params: {
          // protocolVersion intentionally missing
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" }
        }
      } as InitializeRequest;

      await expect(client.send(clientConnection, badRequest, options)).rejects.toThrow();
    });
  });
});
