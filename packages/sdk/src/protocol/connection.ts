import { Protocol } from "./protocol";
import { JSONRPCRequest, JSONRPCNotification, JSONRPCNotificationMethodConstraint, JSONRPCResponse, ConnectionId, Context } from "./types";
import { IncomingMessageContext, IncomingMessageInfo, Transport } from "./transport";

/**
 * Represents an active connection to a transport.
 * Manages the lifecycle of the transport and provides a handle for the protocol.
 */

export interface Connection<
  TIncomingRequest extends JSONRPCRequest,
  TIncomingNotification extends JSONRPCNotification & JSONRPCNotificationMethodConstraint,
  TIncomingResult extends JSONRPCResponse,
  TOutgoingRequest extends JSONRPCRequest,
  TOutgoingNotification extends JSONRPCNotification & JSONRPCNotificationMethodConstraint,
  TOutgoingResult extends JSONRPCResponse,
  TContext extends Context = Context
> {
  /**
   * Unique identifier for this connection.
   */
  readonly id: ConnectionId;

  readonly protocol: Protocol<
    TIncomingRequest,
    TIncomingNotification,
    TIncomingResult,
    TOutgoingRequest,
    TOutgoingNotification,
    TOutgoingResult,
    TContext
  >;

  /**
   * The underlying transport instance.
   */
  readonly transport: Transport<
    TIncomingRequest | TIncomingNotification | TIncomingResult,
    IncomingMessageContext<TContext>,
    IncomingMessageInfo,
    TOutgoingRequest | TOutgoingNotification | TOutgoingResult
  >;

  /**
   * Closes the connection and the underlying transport.
   */
  close(): Promise<void>;
}
