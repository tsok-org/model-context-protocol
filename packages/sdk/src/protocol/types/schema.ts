export * from "../schema.js";
import { Implementation, ClientCapabilities, ServerCapabilities } from "../schema.js";

export type SessionId = string;
export type TaskId = string;
export type EventId = string;

export type JSONRPCNotificationMethodConstraint = {
  method: `notifications/${string}`;
};

export type MethodOf<T extends { method: string }> = T["method"];

export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export enum SessionState {
  Created = "created",
  Initialized = "initialized",
  Expired = "expired",
  Deleted = "deleted"
}

export interface Session {
  readonly id: SessionId;
  readonly state: SessionState;
  getValue<T = JsonValue>(key: string): T | undefined;
  setValue<T = JsonValue>(key: string, value: T): void;
  deleteValue(key: string): void;
  readonly protocolVersion?: string;
  /** Client information from initialize */
  readonly clientInfo?: Implementation;
  /** Server information from initialize */
  readonly serverInfo?: Implementation;
  /** Client capabilities from initialize */
  readonly clientCapabilities?: ClientCapabilities;
  /** Server capabilities from initialize */
  readonly serverCapabilities?: ServerCapabilities;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiredAt?: Date;
  readonly deletedAt?: Date;
}

export type Context = {
  instanceId: string;
};
