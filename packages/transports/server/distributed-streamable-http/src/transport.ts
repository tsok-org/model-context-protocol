/**
 * @fileoverview Distributed Streamable HTTP Server Transport
 *
 * Implements the MCP Streamable HTTP transport specification for distributed
 * deployments with EventBroker-based message routing.
 *
 * ## Transport Interface
 *
 * This transport implements the SDK Transport interface:
 * - connect(): Start accepting connections
 * - disconnect(): Stop accepting connections
 * - send(): Send messages to clients via EventBroker
 * - messageHandler: Protocol sets this to receive incoming messages
 *
 * ## MCP Streamable HTTP Specification
 *
 * Single endpoint (default `/mcp`) handling:
 * - POST: Client JSON-RPC messages → responses as JSON or SSE
 * - GET: Background SSE channel for server-initiated messages
 * - DELETE: Session termination
 *
 * ## Distributed Architecture
 *
 * ```
 * Client → HTTP Transport → EventBroker → Workers → EventBroker → Transport → Client
 *
 * Topics:
 *   mcp.{session}.{request}.inbound   - Workers consume via queue group
 *   mcp.{session}.{request}.outbound  - Transport subscribes for responses
 *   mcp.{session}.bg.outbound         - Background notifications (GET channel)
 *   mcp.{session}.bg.inbound          - Server-to-client requests (GET channel)
 * ```
 *
 * @module transport
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { randomUUID } from "node:crypto";

import {
  isJSONRPCRequest,
  isJSONRPCResponse,
  isJSONRPCError,
  PARSE_ERROR,
  INTERNAL_ERROR,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type Session,
  type TransportSendOptions,
  type TransportMessageHandler,
  type IncomingMessageContext,
  type IncomingMessageInfo
} from "model-context-protocol-sdk";

import type {
  EventBroker,
  Subscription,
  Middleware,
  ErrorMiddleware,
  SessionManager,
  Session as TransportSession,
  ResponseMode,
  ResponseModeStrategy
} from "./interfaces.js";

import {
  RequestInbound,
  RequestOutbound,
  BackgroundOutbound,
  BackgroundInbound,
  type RequestScopeParams,
  type SessionScopeParams
} from "./topics.js";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ENDPOINT = "/";
const DEFAULT_RESPONSE_TIMEOUT_MS = 30_000;
const DEFAULT_ENABLE_BACKGROUND_CHANNEL = true;
const DEFAULT_ENABLE_SESSION_TERMINATION = true;

/** Methods that typically benefit from streaming responses */
const STREAMING_METHODS = new Set(["tools/call", "sampling/createMessage", "prompts/get"]);

// =============================================================================
// Types
// =============================================================================

/**
 * Context type for this transport.
 * Extends SDK requirements with transport-specific data.
 */
interface TransportContext {
  readonly instanceId: string;
}

/**
 * Extended send options for distributed routing.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface DistributedSendOptions extends TransportSendOptions {}

/**
 * Configuration options for the transport.
 */
export interface DistributedStreamableHttpServerTransportOptions {
  /** HTTP server configuration */
  readonly httpServer: {
    readonly port: number;
    readonly host?: string;
    readonly endpoint?: string;
    readonly middlewares?: ReadonlyArray<Middleware | ErrorMiddleware>;
  };

  /** Streamable HTTP behavior options */
  readonly streamableHttp?: {
    readonly responseTimeoutMs?: number;
    readonly responseModeStrategy?: ResponseModeStrategy;
    readonly enableBackgroundChannel?: boolean;
    readonly enableSessionTermination?: boolean;
  };

  /** Session manager for session persistence */
  readonly sessions?: SessionManager;

  /** Event broker for distributed message routing (required) */
  readonly eventBroker: EventBroker;
}

/**
 * Internal result type for session operations.
 */
type SessionResult =
  | { readonly success: true; readonly sessionId: string; readonly session?: TransportSession; readonly isNewSession: boolean }
  | { readonly success: false };

/**
 * Internal type for parsed request body.
 */
interface ParsedBody {
  readonly messages: readonly JSONRPCMessage[];
  readonly isBatch: boolean;
}

// =============================================================================
// Default Response Mode Strategy
// =============================================================================

const defaultResponseModeStrategy: ResponseModeStrategy = (messages: readonly JSONRPCMessage[]): ResponseMode => {
  for (const msg of messages) {
    if (isJSONRPCRequest(msg)) {
      // Methods that typically need streaming
      if (STREAMING_METHODS.has(msg.method)) {
        return "sse";
      }
      // Client requested progress notifications
      const params = msg.params as Record<string, unknown> | undefined;
      const meta = params?.["_meta"] as Record<string, unknown> | undefined;
      if (meta?.["progressToken"] !== undefined) {
        return "sse";
      }
    }
  }
  return "json";
};

// =============================================================================
// Transport Implementation
// =============================================================================

/**
 * Distributed Streamable HTTP Server Transport
 *
 * Implements SDK Transport interface with EventBroker-based message routing
 * for horizontal scaling across multiple server instances.
 */
export class DistributedStreamableHttpServerTransport {
  private readonly server: Server;
  private readonly activeSubs = new Set<Subscription<JSONRPCMessage>>();

  // Configuration (resolved from options)
  private readonly endpoint: string;
  private readonly responseTimeoutMs: number;
  private readonly responseModeStrategy: ResponseModeStrategy;
  private readonly enableBackgroundChannel: boolean;
  private readonly enableSessionTermination: boolean;

  /**
   * Message handler set by the Protocol when connecting.
   * This is how incoming messages are delivered to the protocol layer.
   */
  public messageHandler?: TransportMessageHandler<JSONRPCMessage, IncomingMessageContext<TransportContext>, IncomingMessageInfo>;

  /** Callback when transport is closed */
  public onClose?: () => void;

  /** Callback when an error occurs */
  public onError?: (error: Error) => void;

  constructor(private readonly options: DistributedStreamableHttpServerTransportOptions) {
    if (!options.eventBroker) {
      throw new Error("DistributedStreamableHttpServerTransport requires an 'eventBroker' for message routing.");
    }

    // Resolve configuration with defaults
    this.endpoint = options.httpServer.endpoint ?? DEFAULT_ENDPOINT;
    this.responseTimeoutMs = options.streamableHttp?.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;
    this.responseModeStrategy = options.streamableHttp?.responseModeStrategy ?? defaultResponseModeStrategy;
    this.enableBackgroundChannel = options.streamableHttp?.enableBackgroundChannel ?? DEFAULT_ENABLE_BACKGROUND_CHANNEL;
    this.enableSessionTermination = options.streamableHttp?.enableSessionTermination ?? DEFAULT_ENABLE_SESSION_TERMINATION;

    // Create HTTP server
    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        this.handleError(err, res);
      });
    });
  }

  // ===========================================================================
  // SDK Transport Interface
  // ===========================================================================

  /**
   * Connect the transport (start accepting connections).
   * Required by SDK Transport interface.
   */
  async connect(): Promise<void> {
    const { port, host } = this.options.httpServer;
    return new Promise((resolve, reject) => {
      this.server.listen(port, host, () => {
        console.log(`[MCP Transport] Listening on ${host ?? "0.0.0.0"}:${port}${this.endpoint}`);
        resolve();
      });
      this.server.on("error", (err) => {
        this.onError?.(err);
        reject(err);
      });
    });
  }

  /**
   * Disconnect the transport (stop accepting connections).
   * Required by SDK Transport interface.
   */
  async disconnect(): Promise<void> {
    // Unsubscribe from all broker subscriptions
    const closePromises = Array.from(this.activeSubs).map((sub) => sub.unsubscribe());
    await Promise.all(closePromises);
    this.activeSubs.clear();

    // Close HTTP server
    return new Promise((resolve) => {
      this.server.close(() => {
        this.onClose?.();
        resolve();
      });
    });
  }

  /**
   * Send a message to a specific session via the EventBroker.
   * Required by SDK Transport interface.
   *
   * Routing:
   * - With requestId: Response to specific POST request → RequestOutbound
   * - Without requestId + Request: Server-initiated request → BackgroundInbound
   * - Without requestId + Notification: Server notification → BackgroundOutbound
   */
  async send(message: JSONRPCMessage, options?: DistributedSendOptions): Promise<void> {
    const sessionId = options?.sessionId;
    if (!sessionId) {
      throw new Error("Cannot send message: Missing sessionId in options");
    }

    const requestId = options?.requestId ? String(options.requestId) : undefined;

    if (requestId) {
      // Response or progress for a specific request
      const params: RequestScopeParams = { sessionId, requestId };
      await this.options.eventBroker.publish(RequestOutbound, params, message);
    } else {
      // Server-initiated message
      const params: SessionScopeParams = { sessionId };
      if (isJSONRPCRequest(message)) {
        // Server request to client
        await this.options.eventBroker.publish(BackgroundInbound, params, message);
      } else {
        // Server notification
        await this.options.eventBroker.publish(BackgroundOutbound, params, message);
      }
    }
  }

  // ===========================================================================
  // Legacy Interface (for backward compatibility)
  // ===========================================================================

  /** @deprecated Use connect() */
  async start(): Promise<void> {
    return this.connect();
  }

  /** @deprecated Use disconnect() */
  async stop(): Promise<void> {
    return this.disconnect();
  }

  /** @deprecated Use disconnect() */
  async close(): Promise<void> {
    return this.disconnect();
  }

  /** Check if the server is actively listening */
  isConnected(): boolean {
    return this.server.listening;
  }

  // ===========================================================================
  // HTTP Request Router
  // ===========================================================================

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Run middleware chain
    const proceed = await this.runMiddlewares(req, res);
    if (!proceed) return;

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    // Handle health check endpoints (outside MCP endpoint)
    if (url.pathname === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "healthy" }));
      return;
    }

    if (url.pathname === "/readiness") {
      const isConnected = this.server.listening;
      res.statusCode = isConnected ? 200 : 503;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: isConnected ? "ready" : "not ready",
          listening: isConnected
        })
      );
      return;
    }

    // Only handle configured endpoint for MCP traffic
    if (url.pathname !== this.endpoint) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    // Route by HTTP method per MCP spec
    switch (req.method) {
      case "POST":
        await this.handlePost(req, res);
        break;
      case "GET":
        await this.handleGet(req, res);
        break;
      case "DELETE":
        await this.handleDelete(req, res);
        break;
      case "OPTIONS":
        res.statusCode = 204;
        res.end();
        break;
      default:
        res.statusCode = 405;
        res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
        res.end("Method Not Allowed");
    }
  }

  // ===========================================================================
  // POST Handler
  // ===========================================================================

  private async handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Validate Accept header
    const accept = req.headers.accept ?? "";
    const acceptsJson = accept.includes("application/json") || accept.includes("*/*");
    const acceptsSse = accept.includes("text/event-stream") || accept.includes("*/*");

    if (!acceptsJson && !acceptsSse) {
      res.statusCode = 406;
      res.end("Not Acceptable: Must accept application/json or text/event-stream");
      return;
    }

    // Get or create session
    const sessionResult = this.getOrCreateSession(req, res);
    if (!sessionResult.success) return;
    const { sessionId, session, isNewSession } = sessionResult;

    // Parse request body
    const parseResult = await this.parseRequestBody(req, res);
    if (!parseResult) return;
    const { messages, isBatch } = parseResult;

    // Categorize messages
    const requests = messages.filter(isJSONRPCRequest);
    const hasRequests = requests.length > 0;

    // Notifications only → 202 Accepted (process and respond immediately)
    if (!hasRequests) {
      await this.deliverToProtocol(messages, sessionId, session, req);
      await this.handleNotificationsOnly(sessionId, messages, res);
      return;
    }

    // Determine response mode
    const responseMode = this.responseModeStrategy([...messages], session);

    // Include session ID in response if new
    if (isNewSession && sessionId) {
      res.setHeader("Mcp-Session-Id", sessionId);
    }

    // Route to appropriate response handler (they handle message delivery internally)
    if (responseMode === "sse" && acceptsSse) {
      await this.handleSseResponse(sessionId, messages, isBatch, session, req, res);
    } else if (acceptsJson) {
      await this.handleJsonResponse(sessionId, messages, isBatch, session, req, res);
    } else {
      res.statusCode = 406;
      res.end("Not Acceptable");
    }
  }

  /**
   * Deliver messages to the protocol layer via messageHandler.
   */
  private async deliverToProtocol(
    messages: readonly JSONRPCMessage[],
    sessionId: string,
    session: TransportSession | undefined,
    req: IncomingMessage
  ): Promise<void> {
    if (!this.messageHandler) return;

    for (const message of messages) {
      // Create session context - use full session if available, otherwise create minimal session with just id
      const sessionContext: Session = session ? this.adaptSession(session) : this.createMinimalSession(sessionId);

      const context: IncomingMessageContext<TransportContext> = {
        instanceId: "transport",
        session: sessionContext
      };

      const info: IncomingMessageInfo = {
        timestamp: new Date()
      };

      await this.messageHandler(message, context, info);
    }
  }

  /**
   * Create a minimal session object when no session manager is configured.
   */
  private createMinimalSession(sessionId: string): Session {
    const now = new Date();
    const data = new Map<string, unknown>();
    return {
      id: sessionId,
      state: "created",
      getValue: <T>(key: string) => data.get(key) as T | undefined,
      setValue: <T>(key: string, value: T) => {
        data.set(key, value);
      },
      deleteValue: (key: string) => {
        data.delete(key);
      },
      protocolVersion: undefined,
      clientInfo: undefined,
      serverInfo: undefined,
      clientCapabilities: undefined,
      serverCapabilities: undefined,
      createdAt: now,
      updatedAt: now,
      expiredAt: undefined,
      deletedAt: undefined
    } as Session;
  }

  /**
   * Adapt transport session to SDK Session interface.
   */
  private adaptSession(transportSession: TransportSession): Session {
    return {
      id: transportSession.id,
      state: transportSession.getValue("state") ?? "created",
      getValue: transportSession.getValue.bind(transportSession),
      setValue: transportSession.setValue.bind(transportSession),
      deleteValue: transportSession.deleteValue.bind(transportSession),
      protocolVersion: transportSession.getValue("protocolVersion"),
      clientInfo: transportSession.getValue("clientInfo"),
      serverInfo: transportSession.getValue("serverInfo"),
      clientCapabilities: transportSession.getValue("clientCapabilities"),
      serverCapabilities: transportSession.getValue("serverCapabilities"),
      createdAt: transportSession.getValue("createdAt") ?? new Date(),
      updatedAt: transportSession.getValue("updatedAt") ?? new Date(),
      expiredAt: transportSession.getValue("expiredAt"),
      deletedAt: transportSession.getValue("deletedAt")
    } as Session;
  }

  private async handleNotificationsOnly(sessionId: string, messages: readonly JSONRPCMessage[], res: ServerResponse): Promise<void> {
    for (const message of messages) {
      await this.options.eventBroker.publish(BackgroundOutbound, { sessionId }, message);
    }
    res.statusCode = 202;
    res.end();
  }

  private async handleJsonResponse(
    sessionId: string,
    messages: readonly JSONRPCMessage[],
    isBatch: boolean,
    session: TransportSession | undefined,
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const requests = messages.filter(isJSONRPCRequest);
    const responses: JSONRPCMessage[] = [];
    const pendingRequestIds = new Map<string, string | number>();

    for (const request of requests) {
      pendingRequestIds.set(String(request.id), request.id);
    }

    // Step 1: Subscribe to response topics FIRST (before triggering processing)
    const subscriptions: Array<{ requestId: string; sub: Subscription<JSONRPCMessage> }> = [];

    for (const request of requests) {
      const requestId = String(request.id);
      const sub = this.options.eventBroker.subscribe(RequestOutbound, { sessionId, requestId });
      this.activeSubs.add(sub);
      subscriptions.push({ requestId, sub });
    }

    // Step 1.5: Wait for all subscriptions to be ready to ensure no race condition
    await Promise.all(subscriptions.map(({ sub }) => sub.ready?.()));

    // Step 2: Deliver messages to protocol (this triggers processing and response publishing)
    await this.deliverToProtocol(messages, sessionId, session, req);

    // Step 3: Wait for responses with timeout
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), this.responseTimeoutMs);
    });

    try {
      const responsePromises = subscriptions.map(async ({ requestId, sub }) => {
        for await (const msg of sub) {
          const data = msg.data;
          await msg.ack();

          if (isJSONRPCResponse(data) || isJSONRPCError(data)) {
            responses.push(data);
            pendingRequestIds.delete(requestId);
            await sub.unsubscribe();
            this.activeSubs.delete(sub);
            return;
          }
        }
      });

      const result = await Promise.race([Promise.all(responsePromises), timeoutPromise]);

      if (result === "timeout") {
        // Cleanup and generate timeout errors
        for (const { sub } of subscriptions) {
          await sub.unsubscribe();
          this.activeSubs.delete(sub);
        }

        for (const [, originalId] of pendingRequestIds) {
          responses.push({
            jsonrpc: "2.0",
            id: originalId ?? null,
            error: { code: INTERNAL_ERROR, message: "Request timeout" }
          });
        }
      }
    } catch (err) {
      for (const { sub } of subscriptions) {
        await sub.unsubscribe();
        this.activeSubs.delete(sub);
      }
      this.handleError(err, res);
      return;
    }

    // Send response
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");

    if (isBatch) {
      res.end(JSON.stringify(responses));
    } else {
      res.end(
        JSON.stringify(
          responses[0] ?? {
            jsonrpc: "2.0",
            id: null,
            error: { code: INTERNAL_ERROR, message: "No response" }
          }
        )
      );
    }
  }

  private async handleSseResponse(
    sessionId: string,
    messages: readonly JSONRPCMessage[],
    _isBatch: boolean,
    session: TransportSession | undefined,
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const requests = messages.filter(isJSONRPCRequest);
    const pendingRequests = new Set(requests.map((r) => String(r.id)));

    // Write SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    // Step 1: Subscribe to response topics FIRST (before triggering processing)
    const subscriptions: Subscription<JSONRPCMessage>[] = [];
    for (const request of requests) {
      const requestId = String(request.id);
      const sub = this.options.eventBroker.subscribe(RequestOutbound, { sessionId, requestId });
      this.activeSubs.add(sub);
      subscriptions.push(sub);
    }

    // Handle client disconnect
    req.on("close", () => {
      for (const sub of subscriptions) {
        sub.unsubscribe();
        this.activeSubs.delete(sub);
      }
    });

    // Step 1.5: Wait for all subscriptions to be ready to ensure no race condition
    await Promise.all(subscriptions.map((sub) => sub.ready?.()));

    // Step 2: Deliver messages to protocol (this triggers processing and response publishing)
    await this.deliverToProtocol(messages, sessionId, session, req);

    // Step 3: Stream responses
    try {
      const streamPromises = subscriptions.map(async (sub) => {
        for await (const msg of sub) {
          const data = msg.data;

          res.write(`id: ${msg.id}\n`);
          res.write(`event: message\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);

          await msg.ack();

          if (isJSONRPCResponse(data) || isJSONRPCError(data)) {
            const responseId = String(data.id);
            pendingRequests.delete(responseId);
            await sub.unsubscribe();
            this.activeSubs.delete(sub);
            return;
          }
        }
      });

      await Promise.all(streamPromises);
    } finally {
      for (const sub of subscriptions) {
        await sub.unsubscribe();
        this.activeSubs.delete(sub);
      }
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  // ===========================================================================
  // GET Handler
  // ===========================================================================

  private async handleGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.enableBackgroundChannel) {
      res.statusCode = 405;
      res.setHeader("Allow", "POST, DELETE, OPTIONS");
      res.end("Method Not Allowed");
      return;
    }

    const accept = req.headers.accept ?? "";
    if (!accept.includes("text/event-stream") && !accept.includes("*/*")) {
      res.statusCode = 406;
      res.end("Not Acceptable: Must accept text/event-stream");
      return;
    }

    const sessionResult = this.getExistingSession(req, res);
    if (!sessionResult.success) return;
    const { sessionId } = sessionResult;

    // Write SSE headers (include session ID for confirmation)
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Mcp-Session-Id": sessionId
    });

    res.write(`: connected to background channel\n\n`);

    const lastEventId = req.headers["last-event-id"] as string | undefined;

    const outboundSub = this.options.eventBroker.subscribe(BackgroundOutbound, { sessionId }, { fromEventId: lastEventId });
    const inboundSub = this.options.eventBroker.subscribe(BackgroundInbound, { sessionId }, { fromEventId: lastEventId });

    this.activeSubs.add(outboundSub);
    this.activeSubs.add(inboundSub);

    req.on("close", () => {
      outboundSub.unsubscribe();
      inboundSub.unsubscribe();
      this.activeSubs.delete(outboundSub);
      this.activeSubs.delete(inboundSub);
    });

    const streamChannel = async (sub: Subscription<JSONRPCMessage>): Promise<void> => {
      try {
        for await (const msg of sub) {
          const data = msg.data;

          // Per spec: don't send responses on background channel
          if (!isJSONRPCResponse(data) && !isJSONRPCError(data)) {
            res.write(`id: ${msg.id}\n`);
            res.write(`event: message\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
          }

          await msg.ack();
        }
      } catch {
        // Connection closed
      }
    };

    try {
      await Promise.all([streamChannel(outboundSub), streamChannel(inboundSub)]);
    } finally {
      await outboundSub.unsubscribe();
      await inboundSub.unsubscribe();
      this.activeSubs.delete(outboundSub);
      this.activeSubs.delete(inboundSub);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  // ===========================================================================
  // DELETE Handler
  // ===========================================================================

  private async handleDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.enableSessionTermination) {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, POST, OPTIONS");
      res.end("Method Not Allowed");
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string;

    if (!sessionId) {
      res.statusCode = 400;
      res.end("Bad Request: Missing Mcp-Session-Id header");
      return;
    }

    if (this.options.sessions) {
      this.options.sessions.delete(sessionId, {
        request: {
          headers: req.headers as Record<string, string | string[] | undefined>
        }
      });
    }

    res.statusCode = 204;
    res.end();
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  private getOrCreateSession(req: IncomingMessage, res: ServerResponse): SessionResult {
    const headerSessionId = req.headers["mcp-session-id"] as string | undefined;
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const querySessionId = url.searchParams.get("sessionId");
    const sessionId = headerSessionId ?? querySessionId;

    if (sessionId && this.options.sessions) {
      const session = this.options.sessions.get(sessionId, {
        request: { headers: req.headers as Record<string, string | string[] | undefined> }
      });

      if (!session) {
        res.statusCode = 404;
        res.end("Session Not Found");
        return { success: false };
      }

      return { success: true, sessionId, session, isNewSession: false };
    }

    if (this.options.sessions) {
      const session = this.options.sessions.create({
        request: { headers: req.headers as Record<string, string | string[] | undefined> }
      });
      return { success: true, sessionId: session.id, session, isNewSession: true };
    }

    const newSessionId = randomUUID();
    return { success: true, sessionId: newSessionId, session: undefined, isNewSession: true };
  }

  private getExistingSession(req: IncomingMessage, res: ServerResponse): SessionResult {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId) {
      res.statusCode = 400;
      res.end("Bad Request: Missing Mcp-Session-Id header");
      return { success: false };
    }

    if (this.options.sessions) {
      const session = this.options.sessions.get(sessionId, {
        request: { headers: req.headers as Record<string, string | string[] | undefined> }
      });

      if (!session) {
        res.statusCode = 404;
        res.end("Session Not Found");
        return { success: false };
      }

      return { success: true, sessionId, session, isNewSession: false };
    }

    return { success: true, sessionId, session: undefined, isNewSession: false };
  }

  // ===========================================================================
  // Request Body Parsing
  // ===========================================================================

  private async parseRequestBody(req: IncomingMessage, res: ServerResponse): Promise<ParsedBody | null> {
    return new Promise((resolve) => {
      const body: Buffer[] = [];

      req.on("data", (chunk: Buffer) => body.push(chunk));
      req.on("end", () => {
        try {
          const jsonStr = Buffer.concat(body).toString();
          const parsed: unknown = JSON.parse(jsonStr);

          const isBatch = Array.isArray(parsed);
          const messages = (isBatch ? parsed : [parsed]) as JSONRPCMessage[];

          resolve({ messages, isBatch });
        } catch {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: PARSE_ERROR, message: "Parse error" }
            })
          );
          resolve(null);
        }
      });

      req.on("error", (err) => {
        this.handleError(err, res);
        resolve(null);
      });
    });
  }

  // ===========================================================================
  // Middleware & Error Handling
  // ===========================================================================

  private async runMiddlewares(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const middlewares = this.options.httpServer.middlewares ?? [];
    let idx = 0;

    const execute = async (err?: unknown): Promise<void> => {
      if (res.writableEnded) return;
      if (idx >= middlewares.length) {
        if (err) throw err;
        return;
      }

      const mw = middlewares[idx++];
      try {
        if (err) {
          if (mw.length === 4) {
            await (mw as ErrorMiddleware)(err, req, res, execute);
          } else {
            await execute(err);
          }
        } else {
          if (mw.length < 4) {
            await (mw as Middleware)(req, res, execute);
          } else {
            await execute();
          }
        }
      } catch (catchErr) {
        await execute(catchErr);
      }
    };

    await execute();
    return !res.writableEnded;
  }

  private handleError(err: unknown, res: ServerResponse): void {
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: INTERNAL_ERROR, message: "Internal Server Error" }
        })
      );
    }
    this.onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}
