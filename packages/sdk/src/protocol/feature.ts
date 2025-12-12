import { JSONRPCNotification, JSONRPCRequest, JSONRPCResponse } from "./schema";
import { MessageHandler, MethodOf } from "./types";

/**
 * Context provided to features during initialization.
 * Used to register handlers for specific methods.
 *
 * @typeParam TIncomingRequest - Type of incoming requests
 * @typeParam TIncomingNotification - Type of incoming notifications
 * @typeParam TIncomingResult - Type of incoming results (JSONRPCResponse)
 * @typeParam TOutgoingRequest - Type of outgoing requests
 * @typeParam TOutgoingNotification - Type of outgoing notifications
 * @typeParam TOutgoingResult - Type of outgoing results (JSONRPCResponse)
 * @typeParam TContext - Handler context type
 * @typeParam TRequestMetadata - Transport-specific request metadata
 */
export interface FeatureContext<
  TIncomingRequest extends JSONRPCRequest,
  TIncomingNotification extends JSONRPCNotification,
  TIncomingResult extends JSONRPCResponse,
  TOutgoingRequest extends JSONRPCRequest,
  TOutgoingNotification extends JSONRPCNotification,
  TOutgoingResult extends JSONRPCResponse,
  TContext extends object = object,
  TRequestMetadata extends object = object
> {
  registerHandler<T extends TIncomingRequest | TIncomingNotification>(
    method: MethodOf<T>,
    handler: MessageHandler<T, TIncomingResult, TOutgoingRequest, TOutgoingNotification, TOutgoingResult, TContext, TRequestMetadata>
  ): void;
}

/**
 * A feature that can be registered with a Protocol.
 * Features encapsulate related functionality and handlers.
 *
 * @typeParam TIncomingRequest - Type of incoming requests
 * @typeParam TIncomingNotification - Type of incoming notifications
 * @typeParam TIncomingResult - Type of incoming results (JSONRPCResponse)
 * @typeParam TOutgoingRequest - Type of outgoing requests
 * @typeParam TOutgoingNotification - Type of outgoing notifications
 * @typeParam TOutgoingResult - Type of outgoing results (JSONRPCResponse)
 * @typeParam TContext - Handler context type
 * @typeParam TRequestMetadata - Transport-specific request metadata
 */
export interface Feature<
  TIncomingRequest extends JSONRPCRequest,
  TIncomingNotification extends JSONRPCNotification,
  TIncomingResult extends JSONRPCResponse,
  TOutgoingRequest extends JSONRPCRequest,
  TOutgoingNotification extends JSONRPCNotification,
  TOutgoingResult extends JSONRPCResponse,
  TContext extends object = object,
  TRequestMetadata extends object = object
> {
  initialize(
    context: FeatureContext<
      TIncomingRequest,
      TIncomingNotification,
      TIncomingResult,
      TOutgoingRequest,
      TOutgoingNotification,
      TOutgoingResult,
      TContext,
      TRequestMetadata
    >
  ): void;
}
