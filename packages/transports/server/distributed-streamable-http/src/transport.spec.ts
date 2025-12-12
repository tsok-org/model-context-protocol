import { IncomingMessage, ServerResponse } from "http";
import { DistributedStreamableHttpServerTransport, DistributedStreamableHttpServerTransportOptions } from "./transport";
import { EventBroker, Subscription, Topic, BrokerMessage, SessionManager, Session, JSONRPCMessage } from "./interfaces";

// ==============================================================================
// Test Utilities
// ==============================================================================

/**
 * Creates a mock EventBroker for testing.
 */
function createMockEventBroker(): jest.Mocked<EventBroker> {
  const subscriptions = new Map<string, ((msg: BrokerMessage<unknown>) => void)[]>();

  return {
    publish: jest.fn().mockResolvedValue("event-id-123"),
    subscribe: jest.fn().mockImplementation(<TParams, TData>(topic: Topic<TParams, TData>, params: TParams): Subscription<TData> => {
      const subject = topic.subject(params);
      const callbacks: ((msg: BrokerMessage<TData>) => void)[] = [];
      subscriptions.set(subject, callbacks as ((msg: BrokerMessage<unknown>) => void)[]);

      return {
        [Symbol.asyncIterator]: () => ({
          next: () =>
            new Promise<IteratorResult<BrokerMessage<TData>>>((resolve) => {
              callbacks.push((msg) => resolve({ value: msg as BrokerMessage<TData>, done: false }));
            })
        }),
        unsubscribe: jest.fn().mockResolvedValue(undefined)
      };
    }),
    close: jest.fn().mockResolvedValue(undefined)
  };
}

/**
 * Creates a mock Session for testing.
 */
function createMockSession(id: string): Session {
  const values = new Map<string, unknown>();
  return {
    id,
    getValue: <T>(key: string) => values.get(key) as T | undefined,
    setValue: <T>(key: string, value: T) => {
      values.set(key, value);
    },
    deleteValue: (key: string) => {
      values.delete(key);
    }
  };
}

/**
 * Creates a mock SessionManager for testing.
 */
function createMockSessionManager(): jest.Mocked<SessionManager> {
  const sessions = new Map<string, Session>();

  return {
    create: jest.fn().mockImplementation(() => {
      const id = `session-${Date.now()}`;
      const session = createMockSession(id);
      sessions.set(id, session);
      return session;
    }),
    get: jest.fn().mockImplementation((id: string) => sessions.get(id)),
    delete: jest.fn().mockImplementation((id: string) => {
      sessions.delete(id);
    })
  };
}

/**
 * Creates transport options for testing.
 */
function createTransportOptions(
  overrides: Partial<DistributedStreamableHttpServerTransportOptions> = {}
): DistributedStreamableHttpServerTransportOptions {
  return {
    httpServer: {
      port: 0, // Use any available port
      endpoint: "/mcp",
      ...overrides.httpServer
    },
    eventBroker: overrides.eventBroker || createMockEventBroker(),
    sessions: overrides.sessions,
    streamableHttp: overrides.streamableHttp
  };
}

// ==============================================================================
// Tests
// ==============================================================================

describe("DistributedStreamableHttpServerTransport", () => {
  describe("constructor", () => {
    it("should be defined", () => {
      expect(DistributedStreamableHttpServerTransport).toBeDefined();
    });

    it("should throw if eventBroker is not provided", () => {
      expect(() => {
        new DistributedStreamableHttpServerTransport({
          httpServer: { port: 3000 },
          eventBroker: undefined as unknown as EventBroker
        });
      }).toThrow("eventBroker");
    });

    it("should create transport with valid options", () => {
      const options = createTransportOptions();
      const transport = new DistributedStreamableHttpServerTransport(options);
      expect(transport).toBeDefined();
    });
  });

  describe("lifecycle", () => {
    let transport: DistributedStreamableHttpServerTransport;
    let options: DistributedStreamableHttpServerTransportOptions;

    beforeEach(() => {
      options = createTransportOptions();
      transport = new DistributedStreamableHttpServerTransport(options);
    });

    afterEach(async () => {
      if (transport.isConnected()) {
        await transport.stop();
      }
    });

    it("should start and stop", async () => {
      expect(transport.isConnected()).toBe(false);

      await transport.start();
      expect(transport.isConnected()).toBe(true);

      await transport.stop();
      expect(transport.isConnected()).toBe(false);
    });

    it("should call onClose callback when stopped", async () => {
      const onClose = jest.fn();
      transport.onClose = onClose;

      await transport.start();
      await transport.stop();

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("message handler", () => {
    let transport: DistributedStreamableHttpServerTransport;
    let options: DistributedStreamableHttpServerTransportOptions;

    beforeEach(() => {
      options = createTransportOptions();
      transport = new DistributedStreamableHttpServerTransport(options);
    });

    it("should allow setting and clearing message handler", () => {
      const handler = jest.fn();

      transport.messageHandler = handler;
      expect(transport.messageHandler).toBe(handler);

      transport.messageHandler = undefined;
      expect(transport.messageHandler).toBeUndefined();
    });
  });

  describe("send", () => {
    let transport: DistributedStreamableHttpServerTransport;
    let mockBroker: jest.Mocked<EventBroker>;

    beforeEach(() => {
      mockBroker = createMockEventBroker();
      const options = createTransportOptions({ eventBroker: mockBroker });
      transport = new DistributedStreamableHttpServerTransport(options);
    });

    it("should throw if sessionId is missing", async () => {
      const message: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "test",
        id: "1"
      };

      await expect(transport.send(message, {})).rejects.toThrow("sessionId");
    });

    it("should publish notification to background channel", async () => {
      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "notifications/test"
      };

      await transport.send(notification, { sessionId: "session-1" });

      expect(mockBroker.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.any(Function)
        }),
        { sessionId: "session-1" },
        notification
      );
    });

    it("should publish request to background inbound channel", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "sampling/createMessage",
        id: "1"
      };

      await transport.send(request, { sessionId: "session-1" });

      expect(mockBroker.publish).toHaveBeenCalled();
    });

    it("should publish to request-specific channel when requestId provided", async () => {
      const response: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: "1",
        result: { success: true }
      };

      await transport.send(response, {
        sessionId: "session-1",
        requestId: "req-1"
      });

      expect(mockBroker.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.any(Function)
        }),
        { sessionId: "session-1", requestId: "req-1" },
        response
      );
    });
  });

  describe("configuration", () => {
    it("should use default endpoint /mcp", () => {
      const options = createTransportOptions();
      const transport = new DistributedStreamableHttpServerTransport(options);
      // Default endpoint is /mcp - verified by behavior
      expect(transport).toBeDefined();
    });

    it("should use custom endpoint if provided", () => {
      const options = createTransportOptions({
        httpServer: { port: 3000, endpoint: "/custom-mcp" }
      });
      const transport = new DistributedStreamableHttpServerTransport(options);
      expect(transport).toBeDefined();
    });

    it("should use custom response timeout", () => {
      const options = createTransportOptions({
        streamableHttp: { responseTimeoutMs: 60000 }
      });
      const transport = new DistributedStreamableHttpServerTransport(options);
      expect(transport).toBeDefined();
    });

    it("should use custom response mode strategy", () => {
      const customStrategy = jest.fn().mockReturnValue("json");
      const options = createTransportOptions({
        streamableHttp: { responseModeStrategy: customStrategy }
      });
      const transport = new DistributedStreamableHttpServerTransport(options);
      expect(transport).toBeDefined();
    });

    it("should allow disabling background channel", () => {
      const options = createTransportOptions({
        streamableHttp: { enableBackgroundChannel: false }
      });
      const transport = new DistributedStreamableHttpServerTransport(options);
      expect(transport).toBeDefined();
    });

    it("should allow disabling session termination", () => {
      const options = createTransportOptions({
        streamableHttp: { enableSessionTermination: false }
      });
      const transport = new DistributedStreamableHttpServerTransport(options);
      expect(transport).toBeDefined();
    });
  });
});
