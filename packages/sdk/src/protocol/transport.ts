/**
 * Protocol Transport
 *
 * Transport interface for the Protocol class.
 * This is a more flexible interface that supports various message types.
 */

import { JSONRPCMessage, JSONRPCResponse, Session, SessionId } from "./types";

export type IncomingMessageContext<T> = T & {
  readonly session?: Session;
};

export type IncomingMessageInfo<T extends object = object> = Readonly<T> & {
  readonly timestamp: Date;
};

/**
 * Send options.
 */
export interface TransportSendOptions {
  readonly sessionId?: SessionId;
  readonly requestId?: string;
  readonly timeout?: number;
}

export type TransportMessageHandler<TIncomingMessage, TIncomingMessageContext, TIncomingMessageInfo> = (
  message: TIncomingMessage,
  context: TIncomingMessageContext,
  info: TIncomingMessageInfo
) => Promise<void> | void;

export interface Transport<
  TIncomingMessage extends JSONRPCMessage,
  TIncomingMessageContext extends IncomingMessageContext<object>, // TODO: do we want to default to object here or shall we provide some extra type/in connection with the protocol?
  TIncomingMessageInfo extends IncomingMessageInfo,
  TOutgoingMessage extends JSONRPCMessage | JSONRPCResponse
> {
  connect(): Promise<void>;
  send(message: TOutgoingMessage, options?: TransportSendOptions): Promise<void>;
  messageHandler?: TransportMessageHandler<TIncomingMessage, TIncomingMessageContext, TIncomingMessageInfo>;
  disconnect(): Promise<void>;
}
