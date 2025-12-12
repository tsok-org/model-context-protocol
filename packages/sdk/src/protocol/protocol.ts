import type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCResponse,
  Error,
  ProgressNotification,
  RequestId,
  JSONRPCResultResponse,
  MessageHandler,
  EmptyResult,
  MethodOf,
  JSONRPCNotificationMethodConstraint,
  RequestOptions,
  SessionId,
  JSONRPCErrorResponse,
  ErrorContext,
  LogContext,
  Logger,
  IdGenerator,
  Progress,
  Context,
  ProtocolConnection,
  MessageContext,
  ConnectionId,
  MessageInfo,
  Result
} from "./types";

import { ProtocolError, HandlerError, RequestTimeoutError, ConnectionClosedError, MethodNotFoundError, InternalError } from "./types";

import { IncomingMessageContext, IncomingMessageInfo, Transport } from "./transport.js";
import { Connection } from "./connection.js";
import { SchemaValidator } from "./schema-validator";
import { Feature, FeatureContext } from "./feature";
import { NoopLogger } from "./logger";
import { DefaultIdGenerator } from "./id";

import {
  isCancelledNotification,
  isJSONRPCError,
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResponse,
  isProgressNotification
} from "./assertions.js"; // TODO: Rename to assertions?

import { DEFAULT_REQUEST_TIMEOUT_MS } from "./constants.js";

type RequestKey = `${ConnectionId}:${SessionId}:${RequestId}`;
type ProgressKey = `${ConnectionId}:${SessionId}:${string | number}`;

const mapProgressKey = (connectionId: ConnectionId, sessionId: SessionId | undefined, progressToken: string | number): ProgressKey =>
  `${connectionId}:${sessionId}:${progressToken}`;

const mapRequestKey = (connectionId: ConnectionId, sessionId: SessionId | undefined, requestId: RequestId): RequestKey =>
  `${connectionId}:${sessionId}:${requestId}`;

const unmapRequestKey = (
  requestKey: RequestKey
): {
  connectionId: ConnectionId;
  sessionId: SessionId | undefined;
  requestId: RequestId;
} => {
  const [connectionId, sessionId, requestId] = requestKey.split(":") as [ConnectionId, SessionId | undefined, RequestId];

  return { connectionId, sessionId, requestId };
};

// =============================================================================
// Internal Types
// =============================================================================

type PendingRequest<
  TIncomingRequest extends JSONRPCRequest,
  TIncomingNotification extends JSONRPCNotification & JSONRPCNotificationMethodConstraint,
  TIncomingResult extends JSONRPCResponse,
  TOutgoingRequest extends JSONRPCRequest,
  TOutgoingNotification extends JSONRPCNotification & JSONRPCNotificationMethodConstraint,
  TOutgoingResult extends JSONRPCResponse,
  TContext extends Context = Context
> = {
  readonly resolve: (value: TOutgoingResult | PromiseLike<TOutgoingResult>) => void;
  readonly reject: (error: Error) => void;
  readonly onProgress?: (progress: Progress) => void;
  readonly requestId: RequestId;
  readonly connection: Connection<
    TIncomingRequest,
    TIncomingNotification,
    TIncomingResult,
    TOutgoingRequest,
    TOutgoingNotification,
    TOutgoingResult,
    TContext
  >;
  readonly abortController: AbortController;
  timeout?: ReturnType<typeof setTimeout>;
};

interface ProtocolLoggerContext extends LogContext {
  readonly connectionId: ConnectionId;
}
interface ProtocolLoggerErrorContext extends ErrorContext {
  readonly connectionId: ConnectionId;
}

// =============================================================================
// Protocol Options
// =============================================================================

/**
 * Configuration options for the Protocol.
 */
export type ProtocolOptions<
  TContext extends Context = Context,
  TLoggerContext extends ProtocolLoggerContext = ProtocolLoggerContext,
  TLoggerErrorContext extends ProtocolLoggerErrorContext = ProtocolLoggerErrorContext
> = {
  /**
   * Logger for protocol-level logging.
   * If not provided, NoopLogger will be used.
   */
  readonly logger?: Logger<TLoggerContext, TLoggerErrorContext>;

  /**
   * ID generator for creating unique request identifiers.
   * If not provided, DefaultIdGenerator (UUID-based) will be used.
   */
  readonly id?: IdGenerator;

  readonly context?: <T extends TContext>(context: Context) => MessageContext<T>;

  /**
   * Schema validator to validate incoming messages.
   */
  readonly schemaValidator?: SchemaValidator;

  /**
   * Whether to enforce strict capability checking.
   */
  readonly enforceStrictCapabilities?: boolean;
};

// =============================================================================
// Protocol Class
// =============================================================================
/**
 * Abstract base class for JSON-RPC 2.0 protocol implementations.
 * Manages multiple connections, request/response correlation, and message dispatching.
 */
export class Protocol<
  TIncomingRequest extends JSONRPCRequest,
  TIncomingNotification extends JSONRPCNotification & JSONRPCNotificationMethodConstraint,
  TIncomingResult extends JSONRPCResponse,
  TOutgoingRequest extends JSONRPCRequest,
  TOutgoingNotification extends JSONRPCNotification & JSONRPCNotificationMethodConstraint,
  TOutgoingResult extends JSONRPCResponse,
  TContext extends Context = Context,
  TLoggerContext extends ProtocolLoggerContext = ProtocolLoggerContext,
  TLoggerErrorContext extends ProtocolLoggerErrorContext = ProtocolLoggerErrorContext
> implements FeatureContext<
  TIncomingRequest,
  TIncomingNotification,
  TIncomingResult,
  TOutgoingRequest,
  TOutgoingNotification,
  TOutgoingResult
> {
  protected readonly logger: Logger;
  protected readonly id: IdGenerator;
  protected readonly schemaValidator?: SchemaValidator;
  private readonly connections = new Map<
    ConnectionId,
    Connection<TIncomingRequest, TIncomingNotification, TIncomingResult, TOutgoingRequest, TOutgoingNotification, TOutgoingResult, TContext>
  >();

  // Unified handlers map for both requests and notifications
  private readonly handlers = new Map<
    MethodOf<TIncomingRequest> | MethodOf<TIncomingNotification>,
    MessageHandler<
      TIncomingRequest | TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >
  >();

  // Track incoming requests for cancellation [connectionId:requestId] -> AbortController
  private readonly incomingRequests = new Map<RequestKey, AbortController>();

  // Track outgoing requests
  private readonly pendingRequests = new Map<
    RequestKey,
    PendingRequest<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >
  >();
  private readonly progressTokenIndex = new Map<ProgressKey, RequestKey>();

  constructor(public readonly options?: ProtocolOptions<TContext, TLoggerContext, TLoggerErrorContext>) {
    this.logger = options?.logger ?? new NoopLogger();
    this.id = options?.id ?? new DefaultIdGenerator();
    this.schemaValidator = options?.schemaValidator;
  }

  public registerHandler<T extends TIncomingRequest | TIncomingNotification>(
    method: MethodOf<T>,
    handler: MessageHandler<T, TIncomingResult, TOutgoingRequest, TOutgoingNotification, TOutgoingResult, TContext>
  ): void {
    // Store handler with widened type - type safety is ensured by the method key
    this.handlers.set(
      method as MethodOf<TIncomingRequest> | MethodOf<TIncomingNotification>,
      handler as MessageHandler<
        TIncomingRequest | TIncomingNotification,
        TIncomingResult,
        TOutgoingRequest,
        TOutgoingNotification,
        TOutgoingResult,
        TContext
      >
    );
  }

  private async handle<T extends TIncomingRequest | TIncomingNotification>(
    _connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    message: T,
    context: IncomingMessageContext<TContext>,
    info: IncomingMessageInfo & { signal?: AbortSignal }
  ): Promise<Result | EmptyResult> {
    const handler = this.handlers.get(message.method);

    if (!handler) {
      throw new MethodNotFoundError(message.method);
    }

    const protocol: ProtocolConnection<TOutgoingRequest, TOutgoingNotification, TOutgoingResult> = {
      log(_log, _context) {
        throw new Error("Method not implemented.");
      },
      ping() {
        return Promise.resolve();
      },
      send(_message) {
        throw new Error("Method not implemented.");
      }
    };

    const messageContext: MessageContext<TContext> = {
      id: this.id,
      logger: this.logger,
      instanceId: "context.instanceId",
      session: context.session
    } as MessageContext<TContext>;

    const extendedMessageContext: MessageContext<TContext> = this.options?.context ? this.options.context(messageContext) : messageContext;

    // TODO: here to extend the context with additional fields
    const messageInfo: MessageInfo = {
      ...info,
      method: message.method
    };

    const result = await handler(protocol, message, extendedMessageContext, messageInfo);

    return result;
  }

  public addFeature(
    feature: Feature<TIncomingRequest, TIncomingNotification, TIncomingResult, TOutgoingRequest, TOutgoingNotification, TOutgoingResult>
  ): void {
    feature.initialize(this);
  }

  /**
   * Connects the protocol to a transport.
   */
  public async connect(
    transport: Transport<
      TIncomingNotification | TIncomingRequest | TIncomingResult,
      IncomingMessageContext<TContext>,
      IncomingMessageInfo,
      TOutgoingNotification | TOutgoingRequest | TOutgoingResult
    >
  ): Promise<
    Connection<TIncomingRequest, TIncomingNotification, TIncomingResult, TOutgoingRequest, TOutgoingNotification, TOutgoingResult, TContext>
  > {
    // TODO: Do we need that?

    // if (transport.connected) {
    //   throw new Error("Transport is already connected");
    // }

    const connectionId = this.id.generate({ prefix: "connection" });

    const connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    > = {
      id: connectionId,
      protocol: this as Protocol<
        TIncomingRequest,
        TIncomingNotification,
        TIncomingResult,
        TOutgoingRequest,
        TOutgoingNotification,
        TOutgoingResult,
        TContext
      >,
      transport: transport as Connection<
        TIncomingRequest,
        TIncomingNotification,
        TIncomingResult,
        TOutgoingRequest,
        TOutgoingNotification,
        TOutgoingResult,
        TContext
      >["transport"],
      close: async () => {
        await transport.disconnect();
        this.connections.delete(connectionId);
      }
    };

    this.connections.set(connectionId, connection);

    transport.messageHandler = async (message, context, info) => await this.handleMessage(connection, message, context, info);

    await transport.connect();

    return connection;
  }

  /**
   * Closes the protocol and all connections.
   */
  public async close(): Promise<void> {
    this.logger.info("Closing protocol");

    const error = new ConnectionClosedError();

    // Clear pending requests
    for (const [id, request] of this.pendingRequests) {
      this.clearRequest(id);
      request.reject(error);
    }
    this.pendingRequests.clear();
    this.progressTokenIndex.clear();

    // Abort incoming requests
    for (const controller of this.incomingRequests.values()) {
      controller.abort(error.message);
    }
    this.incomingRequests.clear();

    const closePromises = Array.from(this.connections.values()).map((connection) => connection.close());
    this.connections.clear();
    await Promise.all(closePromises);
  }

  /**
   * Unified send implementation for requests and notifications.
   *
   * Use `options.type` to explicitly specify if the message is a 'request' (expects response)
   * or 'notification' (fire-and-forget). If not specified, auto-detection is attempted
   * but may fail for request messages without an `id` field.
   */
  public async send<T extends TOutgoingRequest | TOutgoingNotification>(
    connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    message: T,
    options: RequestOptions
  ): Promise<TOutgoingResult | void> {
    // === Determine message type ===
    // Notifications in MCP have methods starting with "notifications/"
    // Requests have methods that don't start with "notifications/"
    const method = "method" in message ? (message as { method: string }).method : undefined;
    const isNotificationMethod = method?.startsWith("notifications/") ?? false;

    // TODO: Schema validation
    // === Notification path (simple, early return) ===
    if (isNotificationMethod) {
      await this.onBeforeSendNotification(connection, message, options);
      await connection.transport.send(message as TOutgoingNotification, options);
      await this.onAfterSendNotification(connection, message);
      return;
    }

    // TODO: Schema validation
    // === Request path (has method but not a notification) ===
    if (method) {
      // === Request path ===
      const abortController = new AbortController();
      const sessionId = options.route.sessionId;

      // Caller provides the request with id
      const request = message as TOutgoingRequest;

      const timeout = options.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS;

      const pendingRequestKey = mapRequestKey(connection.id, sessionId, request.id);

      // Setup external abort signal forwarding
      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          abortController.abort();
          const pending = this.pendingRequests.get(pendingRequestKey);
          if (pending) {
            this.clearRequest(pendingRequestKey);
            pending.reject(new InternalError("Request aborted by external signal"));
          }
        });
      }

      await this.onBeforeSendRequest(connection, request, options);

      // Create promise with resolvers for deferred resolution (ES2022 compatible)
      let resolve!: (value: TOutgoingResult | PromiseLike<TOutgoingResult>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<TOutgoingResult>((res, rej) => {
        resolve = res;
        reject = rej;
      });

      const pendingRequest: PendingRequest<
        TIncomingRequest,
        TIncomingNotification,
        TIncomingResult,
        TOutgoingRequest,
        TOutgoingNotification,
        TOutgoingResult,
        TContext
      > = {
        resolve: resolve,
        reject,
        requestId: request.id, // TODO: Review?
        connection,
        abortController,
        onProgress: options?.onProgress
          ? (progress: Progress) => {
              options.onProgress?.(progress);
              if (options.resetTimeoutOnProgress) {
                this.resetTimeout(pendingRequestKey, timeout);
              }
            }
          : undefined
      };

      this.pendingRequests.set(pendingRequestKey, pendingRequest);

      // Register progress token mapping if provided
      if (options?.onProgress && request.params && typeof request.params === "object") {
        const params = request.params as {
          _meta?: { progressToken?: RequestId };
        };
        if (params._meta?.progressToken) {
          const progressKey = mapProgressKey(connection.id, sessionId, params._meta.progressToken);
          this.progressTokenIndex.set(progressKey, pendingRequestKey);
        }
      }

      this.setupTimeout(pendingRequestKey, timeout, pendingRequest);

      try {
        await connection.transport.send(request, {
          // requestId: request.id, // TODO: Review? DO we need that id, if we send request alread yhaving the ID?
          sessionId: sessionId
          // signal: abortController.signal // TODO: Do we need to pass signal to the transport?
        });
        await this.onAfterSendRequest(connection, request);
      } catch (error) {
        const errorMessage = error instanceof Error ? error : new Error(String(error));
        this.reject(pendingRequestKey, new InternalError(errorMessage.message));
      }

      return promise;
    }
    throw new Error("Message must be either a request or a notification");
  }

  /**
   * Handles incoming messages.
   */
  protected async handleMessage(
    connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    message: JSONRPCMessage,
    context: IncomingMessageContext<TContext>,
    info: IncomingMessageInfo
  ): Promise<void> {
    try {
      await this.onBeforeReceive(connection, message, context, info);

      if (isJSONRPCResponse(message)) {
        this.resolve(connection, message, context, info);
      } else if (isJSONRPCError(message)) {
        this.rejectWithError(connection, message, context, info);
      } else if (isJSONRPCRequest(message)) {
        await this.processRequest(connection, message, context, info);
      } else if (isJSONRPCNotification(message)) {
        await this.processNotification(connection, message, context, info);
      }

      await this.onAfterReceive(connection, message, context, info);
    } catch (error) {
      const protocolError = error instanceof ProtocolError ? error : new InternalError(String(error));
      this.handleUnexpectedError(protocolError, {}); // TODO: provide error context { connection, message, context, info }
    }
  }

  private async processRequest(
    connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    message: JSONRPCRequest,
    context: IncomingMessageContext<TContext>,
    info: IncomingMessageInfo
  ): Promise<void> {
    const requestId = message.id;
    const sessionId = context.session?.id;
    const connectionId = connection.id;

    const controller = new AbortController();
    const incomingRequestId = mapRequestKey(connectionId, sessionId, requestId);
    this.incomingRequests.set(incomingRequestId, controller);

    try {
      const result = await this.handle(connection, message as TIncomingRequest, context, { ...info, signal: controller.signal });

      if (!controller.signal.aborted) {
        const response = {
          jsonrpc: "2.0",
          id: requestId,
          result
        } as TOutgoingResult;

        await connection.transport.send(response, {
          sessionId: sessionId,
          requestId: String(requestId)
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const mcpError = error instanceof ProtocolError ? error : new InternalError(String(error));

        const jsonRpcError: JSONRPCErrorResponse = {
          jsonrpc: "2.0",
          id: requestId,
          error: mcpError
        };
        await connection.transport.send(jsonRpcError as TOutgoingResult, {
          sessionId: sessionId,
          requestId: String(requestId)
        });

        this.handleHandlerError(new HandlerError(mcpError.message, message.method, mcpError), {
          connectionId: connection.id,
          requestId: String(requestId),
          context: JSON.stringify(context), // TODO: Review for performance
          method: message.method
        });
      }
    } finally {
      this.incomingRequests.delete(incomingRequestId);
    }
  }

  private async processNotification(
    connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    message: JSONRPCNotification,
    context: IncomingMessageContext<TContext>,
    info: IncomingMessageInfo
  ): Promise<void> {
    const method = message.method;

    // Handle built-in cancellation specifically to access connection context
    if (isCancelledNotification(message)) {
      this.handleCancellation(connection, message, context);
      return;
    }

    // Handle built-in progress specifically
    if (isProgressNotification(message)) {
      this.handleProgress(connection, message, context);
      return;
    }

    const notification: TIncomingNotification = {
      method: message.method,
      params: message.params
    } as TIncomingNotification;

    try {
      await this.handle(connection, notification, context, info);
    } catch (error) {
      const mcpError = error instanceof ProtocolError ? error : new InternalError(String(error));

      this.handleHandlerError(new HandlerError(String(error), method, mcpError), {
        connectionId: connection.id,
        context: JSON.stringify(context), // TODO: Review for performance
        method
      });
    }
  }

  // --- Request Management Methods ---

  private resolve(
    connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    response: JSONRPCResultResponse,
    context: IncomingMessageContext<TContext>,
    info: IncomingMessageInfo
  ): void {
    const requestId = response.id;
    const sessionId = context.session?.id;

    const requestKey = mapRequestKey(connection.id, sessionId, requestId);
    const request = this.pendingRequests.get(requestKey);

    if (request) {
      this.clearRequest(requestKey);
      request.resolve(response as TOutgoingResult); // TODO: I previously was returninning  { id, result } the result object here instead of the full response. Is this change intentional?
    }

    this.logger.info("Resolved request", { connectionId: connection.id, requestId: String(requestId), info: JSON.stringify(info) });
  }

  private reject(requestKey: RequestKey, error: Error): void {
    const request = this.pendingRequests.get(requestKey);

    if (request) {
      this.clearRequest(requestKey);
      request.reject(error);
    }
  }

  private rejectWithError(
    connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    message: JSONRPCErrorResponse,
    context: IncomingMessageContext<TContext>,
    info: IncomingMessageInfo
  ): void {
    const requestId = message.id;
    const sessionId = context.session?.id;

    const error = message.error;

    if (requestId) {
      const requestKey = mapRequestKey(connection.id, sessionId, requestId);
      this.reject(requestKey, error);
    }

    // TODO: Log error details
    this.logger.info("Rejected request", { connectionId: connection.id, requestId: String(requestId), info: JSON.stringify(info) });
  }

  private handleProgress(
    connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    message: ProgressNotification,
    context: IncomingMessageContext<TContext>
  ): void {
    const { progressToken } = message.params;

    const sessionId = context.session?.id;

    const progressKey = mapProgressKey(connection.id, sessionId, progressToken);
    const requestKey = this.progressTokenIndex.get(progressKey);

    if (requestKey) {
      const request = this.pendingRequests.get(requestKey);
      if (request?.onProgress) {
        request.onProgress(message.params);
      }
    }
  }

  private handleCancellation(
    connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    message: JSONRPCNotification,
    context: IncomingMessageContext<TContext>
  ): void {
    const sessionId = context.session?.id;
    const { requestId, reason } = message.params as {
      requestId: RequestId;
      reason?: string;
    };

    const incomingRequestId = mapRequestKey(connection.id, sessionId, requestId);

    const controller = this.incomingRequests.get(incomingRequestId);
    if (controller) {
      controller.abort(reason);
      this.incomingRequests.delete(incomingRequestId);
    }
  }

  private clearRequest(requestKey: RequestKey): void {
    const request = this.pendingRequests.get(requestKey);
    if (request) {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      this.pendingRequests.delete(requestKey);
      this.progressTokenIndex.delete(requestKey);
    }
  }

  private setupTimeout(
    requestKey: RequestKey,
    timeoutMs: number,
    request?: PendingRequest<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >
  ): void {
    const pending = request || this.pendingRequests.get(requestKey);
    if (!pending) return;

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    pending.timeout = setTimeout(() => {
      const req = this.pendingRequests.get(requestKey);
      if (req) {
        const { requestId } = unmapRequestKey(requestKey);
        const error = new RequestTimeoutError(String(requestId), req.connection.id, timeoutMs);
        this.reject(requestKey, error);
      }
    }, timeoutMs);
  }

  private resetTimeout(requestkey: RequestKey, timeoutMs: number): void {
    this.setupTimeout(requestkey, timeoutMs, undefined);
  }

  // Lifecycle hooks and error handlers
  protected async onBeforeSendRequest(
    _connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    _message: TOutgoingRequest,
    _options?: RequestOptions
  ): Promise<void> {
    // Intentionally empty
  }
  protected async onAfterSendRequest(
    _connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    _message: JSONRPCRequest
  ): Promise<void> {
    // Intentionally empty
  }
  protected async onBeforeSendNotification(
    _connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    _message: JSONRPCNotification,
    _options?: RequestOptions
  ): Promise<void> {
    // Intentionally empty
  }
  protected async onAfterSendNotification(
    _connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    _message: JSONRPCNotification
  ): Promise<void> {
    // Intentionally empty
  }
  protected async onBeforeReceive(
    _connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    _message: JSONRPCMessage,
    _context?: IncomingMessageContext<TContext>,
    _info?: IncomingMessageInfo
  ): Promise<void> {
    // Intentionally empty
  }
  protected async onAfterReceive(
    _connection: Connection<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext
    >,
    _message: JSONRPCMessage,
    _context?: IncomingMessageContext<TContext>,
    _info?: IncomingMessageInfo
  ): Promise<void> {
    // Intentionally empty
  }

  protected handleHandlerError(error: globalThis.Error, context: ErrorContext): void {
    this.logger.error("Handler error", error, context);
  }

  protected handleUnexpectedError(error: globalThis.Error, context: ErrorContext): void {
    this.logger.error("Unexpected error", error, context);
  }
}
