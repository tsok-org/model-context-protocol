/**
 * Client-Server Integration Tests
 *
 * Tests for bidirectional communication between Client and Server
 * using in-memory transports.
 */

import { Client } from "./client/client";
import { Server } from "./server/server";
import type { Transport, IncomingMessageContext, IncomingMessageInfo, TransportMessageHandler } from "./protocol/transport";
import type { Context, Session, SessionState, RequestOptions } from "./protocol/types";
import {
  JSONRPC_VERSION,
  type JSONRPCRequest,
  type JSONRPCNotification,
  type JSONRPCResponse,
  type ClientRequest,
  type ClientNotification,
  type ServerRequest,
  type ServerNotification,
  type PingRequest
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

describe("Client-Server Integration", () => {
  let server: Server;
  let client: Client;
  let serverTransport: InMemoryTransport<ServerTransportIncoming, ServerTransportOutgoing>;
  let clientTransport: InMemoryTransport<ClientTransportIncoming, ClientTransportOutgoing>;

  beforeEach(() => {
    // Create server with required options
    server = new Server({
      serverInfo: {
        name: "test-server",
        version: "1.0.0"
      },
      capabilities: {}
    });

    // Create client
    client = new Client();

    // Create linked transports
    [clientTransport, serverTransport] = InMemoryTransport.createPair<ClientTransportIncoming, ServerTransportIncoming>();
  });

  afterEach(async () => {
    await server.close();
    await client.close();
  });

  describe("bidirectional ping", () => {
    it("should ping from client to server and receive response", async () => {
      // Connect both sides
      await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Send ping using low-level send() to verify response structure
      const pingRequest: PingRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "ping",
        id: "client-ping-1"
      };

      const response = await client.send(clientConnection, pingRequest, options);

      // Verify response structure
      expect(response).toBeDefined();
      expect(response).toHaveProperty("jsonrpc", JSONRPC_VERSION);
      expect(response).toHaveProperty("id", "client-ping-1"); // Response ID matches request ID
      expect(response).toHaveProperty("result");
      expect((response as ServerResponse).result).toEqual({}); // EmptyResult
    });

    it("should ping from server to client and receive response", async () => {
      // Connect both sides
      const serverConnection = await server.connect(serverTransport);
      await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Send ping using low-level send() to verify response structure
      const pingRequest: PingRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "ping",
        id: "server-ping-1"
      };

      const response = await server.send(serverConnection, pingRequest, options);

      // Verify response structure
      expect(response).toBeDefined();
      expect(response).toHaveProperty("jsonrpc", JSONRPC_VERSION);
      expect(response).toHaveProperty("id", "server-ping-1"); // Response ID matches request ID
      expect(response).toHaveProperty("result");
      expect((response as ClientResponse).result).toEqual({}); // EmptyResult
    });

    it("should ping bidirectionally and verify both responses", async () => {
      // Connect both sides
      const serverConnection = await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Client -> Server ping
      const clientPingRequest: PingRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "ping",
        id: "c2s-ping"
      };
      const serverResponse = await client.send(clientConnection, clientPingRequest, options);

      expect(serverResponse).toHaveProperty("id", "c2s-ping");
      expect(serverResponse).toHaveProperty("result");

      // Server -> Client ping
      const serverPingRequest: PingRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "ping",
        id: "s2c-ping"
      };
      const clientResponse = await server.send(serverConnection, serverPingRequest, options);

      expect(clientResponse).toHaveProperty("id", "s2c-ping");
      expect(clientResponse).toHaveProperty("result");
    });

    it("should handle multiple concurrent pings with unique response IDs", async () => {
      // Connect both sides
      const serverConnection = await server.connect(serverTransport);
      const clientConnection = await client.connect(clientTransport);

      const options: RequestOptions = {
        route: { sessionId: "test-session" }
      };

      // Send multiple pings concurrently with unique IDs
      const [response1, response2, response3, response4] = await Promise.all([
        client.send(clientConnection, { jsonrpc: JSONRPC_VERSION, method: "ping", id: "concurrent-c1" } as PingRequest, options),
        server.send(serverConnection, { jsonrpc: JSONRPC_VERSION, method: "ping", id: "concurrent-s1" } as PingRequest, options),
        client.send(clientConnection, { jsonrpc: JSONRPC_VERSION, method: "ping", id: "concurrent-c2" } as PingRequest, options),
        server.send(serverConnection, { jsonrpc: JSONRPC_VERSION, method: "ping", id: "concurrent-s2" } as PingRequest, options)
      ]);

      // Verify each response matches its request ID
      expect(response1).toHaveProperty("id", "concurrent-c1");
      expect(response2).toHaveProperty("id", "concurrent-s1");
      expect(response3).toHaveProperty("id", "concurrent-c2");
      expect(response4).toHaveProperty("id", "concurrent-s2");

      // All should have results
      expect(response1).toHaveProperty("result");
      expect(response2).toHaveProperty("result");
      expect(response3).toHaveProperty("result");
      expect(response4).toHaveProperty("result");
    });
  });
});
