/**
 * Type Guards
 *
 * Runtime type checking utilities for JSON-RPC and MCP messages.
 */

import type { JsonValue, JsonObject } from "./types";
import {
  JSONRPC_VERSION,
  type JSONRPCErrorResponse,
  type JSONRPCResultResponse,
  type ContentBlock,
  type JSONRPCMessage,
  type JSONRPCNotification,
  type JSONRPCRequest,
  type ProgressNotification
} from "./schema.js";

// =============================================================================
// Basic Type Guards
// =============================================================================

/**
 * Checks if a value is a non-null object.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks if a value is a valid JSON value.
 */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === "string") return true;
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isObject(value)) return Object.values(value).every(isJsonValue);
  return false;
}

/**
 * Checks if a value is a JSON object.
 */
export function isJsonObject(value: unknown): value is JsonObject {
  return isObject(value) && Object.values(value).every(isJsonValue);
}

// =============================================================================
// JSON-RPC Message Type Guards
// =============================================================================

/**
 * Checks if a value has the JSON-RPC version field.
 */
function hasJSONRPCVersion(value: unknown): value is { jsonrpc: string } {
  return isObject(value) && "jsonrpc" in value && value["jsonrpc"] === JSONRPC_VERSION;
}

/**
 * Checks if a value is a JSON-RPC Request.
 */
export function isJSONRPCRequest(value: unknown): value is JSONRPCRequest {
  if (!hasJSONRPCVersion(value)) return false;
  if (!("id" in value)) return false;
  if (!("method" in value)) return false;

  const obj = value as Record<string, unknown>;

  // id must be string or number
  if (typeof obj["id"] !== "string" && typeof obj["id"] !== "number") return false;

  // method must be string
  if (typeof obj["method"] !== "string") return false;

  // params, if present, must be object or array
  if ("params" in obj && obj["params"] !== undefined) {
    if (!isObject(obj["params"]) && !Array.isArray(obj["params"])) return false;
  }

  return true;
}

/**
 * Checks if a value is a JSON-RPC Notification.
 */
export function isJSONRPCNotification(value: unknown): value is JSONRPCNotification {
  if (!hasJSONRPCVersion(value)) return false;
  if ("id" in value) return false; // Notifications must NOT have id
  if (!("method" in value)) return false;

  const obj = value as Record<string, unknown>;

  // method must be string
  if (typeof obj["method"] !== "string") return false;

  // params, if present, must be object or array
  if ("params" in obj && obj["params"] !== undefined) {
    if (!isObject(obj["params"]) && !Array.isArray(obj["params"])) return false;
  }

  return true;
}

/**
 * Checks if a value is a JSON-RPC Response.
 */
export function isJSONRPCResponse(value: unknown): value is JSONRPCResultResponse {
  if (!hasJSONRPCVersion(value)) return false;
  if (!("id" in value)) return false;
  if (!("result" in value)) return false;
  if ("error" in value) return false; // Must not have error

  const obj = value as Record<string, unknown>;

  // id must be string or number
  if (typeof obj["id"] !== "string" && typeof obj["id"] !== "number") return false;

  return true;
}

/**
 * Checks if a value is a JSON-RPC Error.
 */
export function isJSONRPCError(value: unknown): value is JSONRPCErrorResponse {
  if (!hasJSONRPCVersion(value)) return false;
  if (!("id" in value)) return false;
  if (!("error" in value)) return false;

  const obj = value as Record<string, unknown>;

  // id can be string, number, or null
  const idValue = obj["id"];
  if (idValue !== null && typeof idValue !== "string" && typeof idValue !== "number") {
    return false;
  }

  // error must be an object with code and message
  const errorValue = obj["error"];
  if (!isObject(errorValue)) return false;
  if (typeof errorValue["code"] !== "number") return false;
  if (typeof errorValue["message"] !== "string") return false;

  return true;
}

/**
 * Checks if a value is any JSON-RPC Message.
 */
export function isJSONRPCMessage(value: unknown): value is JSONRPCMessage {
  return isJSONRPCRequest(value) || isJSONRPCNotification(value) || isJSONRPCResponse(value) || isJSONRPCError(value);
}

// =============================================================================
// MCP-Specific Type Guards
// =============================================================================

/**
 * Checks if a notification is a progress notification.
 */
export function isProgressNotification(value: unknown): value is ProgressNotification {
  if (!isJSONRPCNotification(value)) return false;
  if (value.method !== "notifications/progress") return false;

  const params = value.params;
  if (!isObject(params)) return false;
  if (!("progressToken" in params)) return false;
  if (!("progress" in params)) return false;

  const progressToken = params["progressToken"];
  if (typeof progressToken !== "string" && typeof progressToken !== "number") return false;

  if (typeof params["progress"] !== "number") return false;

  return true;
}

/**
 * Checks if a notification is a cancelled notification.
 */
export function isCancelledNotification(value: unknown): value is JSONRPCNotification & { params: { requestId: string | number } } {
  if (!isJSONRPCNotification(value)) return false;
  if (value.method !== "notifications/cancelled") return false;

  const params = value.params;
  if (!isObject(params)) return false;
  if (!("requestId" in params)) return false;

  const requestId = params["requestId"];
  if (typeof requestId !== "string" && typeof requestId !== "number") return false;

  return true;
}

/**
 * Checks if a value is a text content block.
 */
export function isTextContent(value: unknown): value is ContentBlock & { type: "text" } {
  if (!isObject(value)) return false;
  if (value["type"] !== "text") return false;
  if (typeof value["text"] !== "string") return false;
  return true;
}

/**
 * Checks if a value is an image content block.
 */
export function isImageContent(value: unknown): value is ContentBlock & { type: "image" } {
  if (!isObject(value)) return false;
  if (value["type"] !== "image") return false;
  if (typeof value["data"] !== "string") return false;
  if (typeof value["mimeType"] !== "string") return false;
  return true;
}

/**
 * Checks if a value is a content block.
 */
export function isContentBlock(value: unknown): value is ContentBlock {
  if (!isObject(value)) return false;
  const type = value["type"];
  return type === "text" || type === "image" || type === "audio" || type === "resource_link" || type === "resource";
}
