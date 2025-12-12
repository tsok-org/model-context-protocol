import type { SchemaRegistry } from "./schema-registry";
import { createSchemaResolver } from "./schema-registry";

import {
  CancelledNotificationSchema,
  CallToolRequestSchema,
  CallToolResultResponseSchema,
  GetPromptRequestSchema,
  GetPromptResultResponseSchema,
  InitializeRequestSchema,
  InitializeResultResponseSchema,
  InitializedNotificationSchema,
  JsonRpcErrorResponseSchema,
  JsonRpcResultResponseSchema,
  ListPromptsRequestSchema,
  ListPromptsResultResponseSchema,
  ListResourcesRequestSchema,
  ListResourcesResultResponseSchema,
  ListToolsRequestSchema,
  ListToolsResultResponseSchema,
  LoggingMessageNotificationSchema,
  PromptListChangedNotificationSchema,
  PingRequestSchema,
  ProgressNotificationSchema,
  ReadResourceRequestSchema,
  ReadResourceResultResponseSchema,
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema,
  SetLevelRequestSchema,
  SubscribeRequestSchema,
  ToolListChangedNotificationSchema,
  UnsubscribeRequestSchema
} from "model-context-protocol-specification";

/**
 * Default Standard-Schema-compatible runtime schemas for a small core of MCP methods.
 *
 * These are intentionally conservative: they validate JSON-RPC envelopes and the
 * method-specific params/result shapes for a few foundational messages.
 */
export const defaultSchemaRegistry: SchemaRegistry = {
  methods: {
    ping: {
      request: PingRequestSchema,
      // `ping` has an empty-ish result shape in the spec; validate the envelope only.
      result: JsonRpcResultResponseSchema
    },
    initialize: {
      request: InitializeRequestSchema,
      result: InitializeResultResponseSchema
    },

    "resources/list": {
      request: ListResourcesRequestSchema,
      result: ListResourcesResultResponseSchema
    },
    "resources/read": {
      request: ReadResourceRequestSchema,
      result: ReadResourceResultResponseSchema
    },
    "resources/subscribe": {
      request: SubscribeRequestSchema,
      // subscribe returns EmptyResult; validate the envelope only.
      result: JsonRpcResultResponseSchema
    },
    "resources/unsubscribe": {
      request: UnsubscribeRequestSchema,
      // unsubscribe returns EmptyResult; validate the envelope only.
      result: JsonRpcResultResponseSchema
    },

    "prompts/list": {
      request: ListPromptsRequestSchema,
      result: ListPromptsResultResponseSchema
    },
    "prompts/get": {
      request: GetPromptRequestSchema,
      result: GetPromptResultResponseSchema
    },

    "tools/list": {
      request: ListToolsRequestSchema,
      result: ListToolsResultResponseSchema
    },
    "tools/call": {
      request: CallToolRequestSchema,
      result: CallToolResultResponseSchema
    },

    "logging/setLevel": {
      request: SetLevelRequestSchema,
      // setLevel returns EmptyResult; validate the envelope only.
      result: JsonRpcResultResponseSchema
    },

    "notifications/progress": { notification: ProgressNotificationSchema },
    "notifications/cancelled": { notification: CancelledNotificationSchema },
    "notifications/initialized": { notification: InitializedNotificationSchema },
    "notifications/message": { notification: LoggingMessageNotificationSchema },
    "notifications/resources/list_changed": { notification: ResourceListChangedNotificationSchema },
    "notifications/resources/updated": { notification: ResourceUpdatedNotificationSchema },
    "notifications/prompts/list_changed": { notification: PromptListChangedNotificationSchema },
    "notifications/tools/list_changed": { notification: ToolListChangedNotificationSchema }
  },
  fallback: {
    result: JsonRpcResultResponseSchema,
    error: JsonRpcErrorResponseSchema
  }
};

/**
 * Convenience SchemaResolver built from `defaultSchemaRegistry`.
 */
export const defaultSchemaResolver = createSchemaResolver(defaultSchemaRegistry);
