import type {
  JSONRPCNotificationMethodConstraint,
  JSONRPCNotification,
  JSONRPCRequest,
  EmptyResult,
  JSONRPCResponse,
  JSONRPCResultResponse,
  LoggingMessageNotificationParams
} from "./schema.js";
import type { IdGenerator } from "./id.js";
import type { Logger } from "./logger.js";
import { IncomingMessageContext } from "../transport.js";

/**
 * Extracts the Result type from a JSONRPCResultResponse.
 * Used to determine the return type of message handlers.
 */
export type ResultOf<T extends JSONRPCResponse> = T extends JSONRPCResultResponse<infer R> ? R : never;

/**
 * Message handler function type.
 *
 * Handlers receive a protocol connection, message, context, and info.
 * For requests, they return the Result type (not the full JSONRPCResponse).
 * The protocol wraps the result in a JSONRPCResultResponse before sending.
 * For notifications, they return EmptyResult.
 *
 * @typeParam T - The incoming message type (request or notification)
 * @typeParam TIncomingResult - The JSONRPCResponse type (used to infer Result)
 * @typeParam TOutgoingRequest - Outgoing request type for protocol connection
 * @typeParam TOutgoingNotification - Outgoing notification type for protocol connection
 * @typeParam TOutgoingResult - Outgoing result type for protocol connection
 * @typeParam TMessageHandlerContext - Additional handler context type
 * @typeParam TRequestMetadata - Transport-specific request metadata
 */
export type MessageHandler<
  T extends JSONRPCRequest | JSONRPCNotification,
  TIncomingResult extends JSONRPCResponse,
  TOutgoingRequest extends JSONRPCRequest,
  TOutgoingNotification extends JSONRPCNotification,
  TOutgoingResult extends JSONRPCResponse,
  TMessageHandlerContext extends object = object,
  TRequestMetadata extends object = object
> = (
  protocol: ProtocolConnection<TOutgoingRequest, TOutgoingNotification, TOutgoingResult>,
  message: T,
  context: MessageContext<TMessageHandlerContext>,
  info: MessageInfo<TRequestMetadata>
) => Promise<T extends JSONRPCNotificationMethodConstraint ? EmptyResult : ResultOf<TIncomingResult>>;

// export type IsomorphicHeaders = Record<string, string | string[] | undefined>;
// export type RequestMetadata = {
//   headers?: IsomorphicHeaders;
// }

export type TransportRequestMetadata<T extends object> = Readonly<T>;

export type MessageInfo<TTransportRequestMetadata extends object = object> = {
  readonly method?: string;
  readonly sessionId?: string;
  readonly request?: TransportRequestMetadata<TTransportRequestMetadata>;
};

// TODO: Isntead of object we should use generic that may provide authentication and headers

export type MessageContext<TMessageHandlerContext> = IncomingMessageContext<TMessageHandlerContext> & {
  readonly logger: Logger;
  readonly id: IdGenerator;
};

export type ProtocolConnection<
  TOutgoingRequest extends JSONRPCRequest = JSONRPCRequest,
  TOutgoingNotification extends JSONRPCNotification = JSONRPCNotification,
  TOutgoingResult extends JSONRPCResponse = JSONRPCResponse
> = {
  // TODO: may be to do separate Notify and Request methods?
  readonly send: <T extends TOutgoingNotification | TOutgoingRequest>(
    message: Exclude<TOutgoingNotification, "jsonrpc" | "id">
    // options?: T extends JSONRPCNotificationMethodConstraint ? { route: Route } : RequestOptions
  ) => Promise<T extends JSONRPCNotificationMethodConstraint ? void : TOutgoingResult>;
  readonly ping: () => Promise<void>;

  readonly log: (log: LoggingMessageNotificationParams, context?: object) => void;
};
