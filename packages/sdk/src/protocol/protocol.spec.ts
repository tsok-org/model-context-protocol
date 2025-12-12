/**
 * Protocol Tests
 *
 * Tests for the Protocol class using in-memory transports.
 * Uses MCP-compliant types from the schema.
 */

import { Protocol } from "./protocol";
import type { Transport, IncomingMessageContext, IncomingMessageInfo, TransportMessageHandler } from "./transport";
import type { MessageHandler, RequestOptions, Context, Session, SessionState } from "./types";
import {
  JSONRPC_VERSION,
  type JSONRPCRequest,
  type JSONRPCNotification,
  type JSONRPCResponse,
  type JSONRPCResultResponse,
  type PingRequest,
  type ClientRequest,
  type ClientNotification,
  type ClientResult,
  type ServerRequest,
  type ServerNotification,
  type ServerResult,
  type RequestId
} from "./schema";

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

/**
 * Generates a unique request id for testing.
 */
let requestIdCounter = 0;
function generateRequestId(): RequestId {
  return `test-request-${++requestIdCounter}`;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Wrapped response types for client (receives server results).
 */
type ClientResponse = JSONRPCResultResponse<ServerResult>;

/**
 * Wrapped response types for server (receives client results).
 */
type ServerResponse = JSONRPCResultResponse<ClientResult>;

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
    // The peer receives what we send (TOutgoing becomes their TIncoming)
    if (this._peer.messageHandler) {
      const context: IncomingMessageContext<Context> = {
        instanceId: "test-instance",
        // Pass session info so response routing works correctly
        session: options?.sessionId ? createMockSession(options.sessionId) : undefined
      };
      const info: IncomingMessageInfo = {
        timestamp: new Date()
      };
      // Type assertion is safe here because peer's TIncoming matches our TOutgoing by construction
      await this._peer.messageHandler(message as never, context, info);
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }
}

// =============================================================================
// Test Protocol Classes
// =============================================================================

/**
 * Server-side protocol for testing.
 * - Incoming: ClientRequest, ClientNotification (from client)
 * - Outgoing: ServerRequest, ServerNotification, ServerResponse (to client)
 */
class TestServer extends Protocol<
  ClientRequest,
  ClientNotification,
  ServerResponse,
  ServerRequest,
  ServerNotification,
  ClientResponse,
  Context
> {
  constructor() {
    super();
  }
}

/**
 * Client-side protocol for testing.
 * - Incoming: ServerRequest, ServerNotification (from server)
 * - Outgoing: ClientRequest, ClientNotification, ClientResponse (to server)
 */
class TestClient extends Protocol<
  ServerRequest,
  ServerNotification,
  ClientResponse,
  ClientRequest,
  ClientNotification,
  ServerResponse,
  Context
> {
  constructor() {
    super();
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

describe("Protocol", () => {
  let server: TestServer;
  let client: TestClient;
  let serverTransport: InMemoryTransport<ServerTransportIncoming, ServerTransportOutgoing>;
  let clientTransport: InMemoryTransport<ClientTransportIncoming, ClientTransportOutgoing>;

  beforeEach(() => {
    server = new TestServer();
    client = new TestClient();
    [clientTransport, serverTransport] = InMemoryTransport.createPair<ClientTransportIncoming, ServerTransportIncoming>();
  });

  describe("connection", () => {
    it("should connect client and server", async () => {
      const serverConnection = await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      expect(serverConnection).toBeDefined();
      expect(serverConnection.id).toBeDefined();
      expect(clientConnection).toBeDefined();
      expect(clientConnection.id).toBeDefined();
    });
  });

  describe("request/response", () => {
    it("should handle ping request", async () => {
      // Register ping handler on server
      const pingHandler: MessageHandler<
        PingRequest,
        ServerResponse,
        ServerRequest,
        ServerNotification,
        ClientResponse,
        Context
      > = async () => {
        return {};
      };
      server.registerHandler("ping", pingHandler);

      // Connect both
      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      // Send ping from client - caller provides full request with id
      const request: PingRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "ping",
        id: generateRequestId()
      };

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      const response = await client.send(clientConnection, request, options);

      expect(response).toBeDefined();
      expect(response).toHaveProperty("jsonrpc", JSONRPC_VERSION);
      expect(response).toHaveProperty("result");
    });

    it("should handle multiple sequential requests", async () => {
      let callCount = 0;

      const pingHandler: MessageHandler<
        PingRequest,
        ServerResponse,
        ServerRequest,
        ServerNotification,
        ClientResponse,
        Context
      > = async () => {
        callCount++;
        return {};
      };
      server.registerHandler("ping", pingHandler);

      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Send multiple requests - each with unique id
      await client.send(clientConnection, { jsonrpc: JSONRPC_VERSION, method: "ping", id: generateRequestId() }, options);
      await client.send(clientConnection, { jsonrpc: JSONRPC_VERSION, method: "ping", id: generateRequestId() }, options);
      await client.send(clientConnection, { jsonrpc: JSONRPC_VERSION, method: "ping", id: generateRequestId() }, options);

      expect(callCount).toBe(3);
    });
  });

  describe("bidirectional communication", () => {
    it("should allow both sides to send and receive ping", async () => {
      // Server handles ping from client
      const serverPingHandler: MessageHandler<
        PingRequest,
        ServerResponse,
        ServerRequest,
        ServerNotification,
        ClientResponse,
        Context
      > = async () => ({});
      server.registerHandler("ping", serverPingHandler);

      // Client handles ping from server
      const clientPingHandler: MessageHandler<
        PingRequest,
        ClientResponse,
        ClientRequest,
        ClientNotification,
        ServerResponse,
        Context
      > = async () => ({});
      client.registerHandler("ping", clientPingHandler);

      const serverConnection = await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Client sends to server - caller provides id
      const clientToServerRequest: PingRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "ping",
        id: generateRequestId()
      };
      const serverResponse = await client.send(clientConnection, clientToServerRequest, options);
      expect(serverResponse).toHaveProperty("result");

      // Server sends to client - caller provides id
      const serverToClientRequest: PingRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "ping",
        id: generateRequestId()
      };
      const clientResponse = await server.send(serverConnection, serverToClientRequest, options);
      expect(clientResponse).toHaveProperty("result");
    });
  });

  describe("error handling", () => {
    it("should return error for unhandled method", async () => {
      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const request: PingRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "ping",
        id: generateRequestId()
      };

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // No handler registered, should reject
      await expect(client.send(clientConnection, request, options)).rejects.toThrow();
    });

    it("should handle handler errors gracefully", async () => {
      const errorHandler: MessageHandler<
        PingRequest,
        ServerResponse,
        ServerRequest,
        ServerNotification,
        ClientResponse,
        Context
      > = async () => {
        throw new Error("Handler error");
      };
      server.registerHandler("ping", errorHandler);

      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const request: PingRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "ping",
        id: generateRequestId()
      };

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Handler throws, should reject with error
      await expect(client.send(clientConnection, request, options)).rejects.toThrow();
    });
  });

  describe("close", () => {
    it("should close connections properly", async () => {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      await server.close();
      await client.close();

      // Should not throw
      expect(true).toBe(true);
    });
  });
});
