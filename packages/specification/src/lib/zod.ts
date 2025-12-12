import { z } from "zod";

/**
 * Zod v4 schemas for core MCP / JSON-RPC message shapes.
 *
 * These schemas implement the Standard Schema interface automatically (via Zod v4),
 * so they can be consumed by the SDK's StandardSchemaValidator.
 */

export const JsonRpcVersionSchema = z.literal("2.0");

export const RequestIdSchema = z.union([z.string(), z.number()]);

export const MetaSchema = z
  .object({
    progressToken: z.union([z.string(), z.number()]).optional()
  })
  .passthrough();

export const RequestParamsSchema = z
  .object({
    _meta: MetaSchema.optional()
  })
  .passthrough();

export const CursorSchema = z.string();

export const PaginatedRequestParamsSchema = RequestParamsSchema.extend({
  cursor: CursorSchema.optional()
}).passthrough();

export const NotificationParamsSchema = z
  .object({
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const BaseMetadataSchema = z
  .object({
    name: z.string(),
    title: z.string().optional()
  })
  .passthrough();

export const JsonRpcErrorSchema = z
  .object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional()
  })
  .passthrough();

export const JsonRpcResultResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  result: z.unknown()
});

export const JsonRpcErrorResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: z.union([RequestIdSchema, z.null()]),
  error: JsonRpcErrorSchema
});

// -----------------------------------------------------------------------------
// Core MCP methods
// -----------------------------------------------------------------------------

export const PingRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  method: z.literal("ping"),
  params: RequestParamsSchema.optional()
});

export const ProgressNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  method: z.literal("notifications/progress"),
  params: z.object({
    progressToken: z.union([z.string(), z.number()]),
    progress: z.number(),
    total: z.number().optional(),
    message: z.string().optional()
  })
});

export const CancelledNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  method: z.literal("notifications/cancelled"),
  params: z.object({
    requestId: z.union([z.string(), z.number()]),
    reason: z.string().optional()
  })
});

export const InitializedNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  method: z.literal("notifications/initialized"),
  params: NotificationParamsSchema.optional()
});

export const IconSchema = z.object({
  src: z.string(),
  mimeType: z.string().optional(),
  sizes: z.array(z.string()).optional(),
  theme: z.union([z.literal("light"), z.literal("dark")]).optional()
});

export const IconsSchema = z
  .object({
    icons: z.array(IconSchema).optional()
  })
  .passthrough();

export const ImplementationSchema = z
  .object({
    name: z.string(),
    title: z.string().optional(),
    version: z.string(),
    description: z.string().optional(),
    websiteUrl: z.string().optional(),
    icons: z.array(IconSchema).optional()
  })
  .passthrough();

export const ClientCapabilitiesSchema = z
  .object({
    experimental: z.record(z.string(), z.unknown()).optional(),
    roots: z
      .object({
        listChanged: z.boolean().optional()
      })
      .passthrough()
      .optional(),
    sampling: z
      .object({
        context: z.unknown().optional(),
        tools: z.unknown().optional()
      })
      .passthrough()
      .optional(),
    elicitation: z
      .object({
        form: z.unknown().optional(),
        url: z.unknown().optional()
      })
      .passthrough()
      .optional(),
    tasks: z.unknown().optional()
  })
  .passthrough();

export const ServerCapabilitiesSchema = z
  .object({
    experimental: z.record(z.string(), z.unknown()).optional(),
    logging: z.unknown().optional(),
    completions: z.unknown().optional(),
    prompts: z
      .object({
        listChanged: z.boolean().optional()
      })
      .passthrough()
      .optional(),
    resources: z
      .object({
        subscribe: z.boolean().optional(),
        listChanged: z.boolean().optional()
      })
      .passthrough()
      .optional(),
    tools: z
      .object({
        listChanged: z.boolean().optional()
      })
      .passthrough()
      .optional(),
    tasks: z.unknown().optional()
  })
  .passthrough();

export const InitializeRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  method: z.literal("initialize"),
  params: z
    .object({
      protocolVersion: z.string(),
      capabilities: ClientCapabilitiesSchema,
      clientInfo: ImplementationSchema
    })
    .passthrough()
});

export const InitializeResultSchema = z.object({
  protocolVersion: z.string(),
  capabilities: ServerCapabilitiesSchema,
  serverInfo: ImplementationSchema,
  instructions: z.string().optional()
});

export const InitializeResultResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  result: InitializeResultSchema
});

// -----------------------------------------------------------------------------
// Common content shapes
// -----------------------------------------------------------------------------

export const TextResourceContentsSchema = z
  .object({
    uri: z.string(),
    mimeType: z.string().optional(),
    text: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const BlobResourceContentsSchema = z
  .object({
    uri: z.string(),
    mimeType: z.string().optional(),
    blob: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const TextContentSchema = z
  .object({
    type: z.literal("text"),
    text: z.string(),
    annotations: z.unknown().optional(),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const ImageContentSchema = z
  .object({
    type: z.literal("image"),
    data: z.string(),
    mimeType: z.string(),
    annotations: z.unknown().optional(),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const AudioContentSchema = z
  .object({
    type: z.literal("audio"),
    data: z.string(),
    mimeType: z.string(),
    annotations: z.unknown().optional(),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const ResourceSchema = BaseMetadataSchema.and(IconsSchema).and(
  z
    .object({
      uri: z.string(),
      description: z.string().optional(),
      mimeType: z.string().optional(),
      annotations: z.unknown().optional(),
      size: z.number().optional(),
      _meta: z.record(z.string(), z.unknown()).optional()
    })
    .passthrough()
);

export const ResourceLinkSchema = ResourceSchema.and(
  z
    .object({
      type: z.literal("resource_link")
    })
    .passthrough()
);

export const EmbeddedResourceSchema = z
  .object({
    type: z.literal("resource"),
    resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
    annotations: z.unknown().optional(),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const ContentBlockSchema = z.union([
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
  ResourceLinkSchema,
  EmbeddedResourceSchema
]);

export const PromptArgumentSchema = BaseMetadataSchema.and(
  z
    .object({
      description: z.string().optional(),
      required: z.boolean().optional()
    })
    .passthrough()
);

export const PromptSchema = BaseMetadataSchema.and(IconsSchema).and(
  z
    .object({
      description: z.string().optional(),
      arguments: z.array(PromptArgumentSchema).optional(),
      _meta: z.record(z.string(), z.unknown()).optional()
    })
    .passthrough()
);

export const JsonSchemaObjectSchema = z
  .object({
    $schema: z.string().optional(),
    type: z.literal("object"),
    properties: z.record(z.string(), z.unknown()).optional(),
    required: z.array(z.string()).optional()
  })
  .passthrough();

export const ToolSchema = BaseMetadataSchema.and(IconsSchema).and(
  z
    .object({
      description: z.string().optional(),
      inputSchema: JsonSchemaObjectSchema,
      execution: z
        .object({
          taskSupport: z.union([z.literal("forbidden"), z.literal("optional"), z.literal("required")]).optional()
        })
        .passthrough()
        .optional(),
      outputSchema: JsonSchemaObjectSchema.optional(),
      annotations: z.unknown().optional(),
      _meta: z.record(z.string(), z.unknown()).optional()
    })
    .passthrough()
);

// -----------------------------------------------------------------------------
// Resources
// -----------------------------------------------------------------------------

export const ListResourcesRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  method: z.literal("resources/list"),
  params: PaginatedRequestParamsSchema.optional()
});

export const ListResourcesResultSchema = z
  .object({
    resources: z.array(ResourceSchema),
    nextCursor: CursorSchema.optional(),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const ListResourcesResultResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  result: ListResourcesResultSchema
});

export const ReadResourceRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  method: z.literal("resources/read"),
  params: RequestParamsSchema.extend({
    uri: z.string()
  }).passthrough()
});

export const ReadResourceResultSchema = z
  .object({
    contents: z.array(z.union([TextResourceContentsSchema, BlobResourceContentsSchema])),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const ReadResourceResultResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  result: ReadResourceResultSchema
});

export const SubscribeRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  method: z.literal("resources/subscribe"),
  params: RequestParamsSchema.extend({
    uri: z.string()
  }).passthrough()
});

export const UnsubscribeRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  method: z.literal("resources/unsubscribe"),
  params: RequestParamsSchema.extend({
    uri: z.string()
  }).passthrough()
});

export const ResourceListChangedNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  method: z.literal("notifications/resources/list_changed"),
  params: NotificationParamsSchema.optional()
});

export const ResourceUpdatedNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  method: z.literal("notifications/resources/updated"),
  params: NotificationParamsSchema.extend({
    uri: z.string()
  }).passthrough()
});

// -----------------------------------------------------------------------------
// Prompts
// -----------------------------------------------------------------------------

export const ListPromptsRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  method: z.literal("prompts/list"),
  params: PaginatedRequestParamsSchema.optional()
});

export const ListPromptsResultSchema = z
  .object({
    prompts: z.array(PromptSchema),
    nextCursor: CursorSchema.optional(),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const ListPromptsResultResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  result: ListPromptsResultSchema
});

export const GetPromptRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  method: z.literal("prompts/get"),
  params: RequestParamsSchema.extend({
    name: z.string(),
    arguments: z.record(z.string(), z.string()).optional()
  }).passthrough()
});

export const PromptMessageSchema = z
  .object({
    role: z.union([z.literal("user"), z.literal("assistant")]),
    content: ContentBlockSchema
  })
  .passthrough();

export const GetPromptResultSchema = z
  .object({
    description: z.string().optional(),
    messages: z.array(PromptMessageSchema),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const GetPromptResultResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  result: GetPromptResultSchema
});

export const PromptListChangedNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  method: z.literal("notifications/prompts/list_changed"),
  params: NotificationParamsSchema.optional()
});

// -----------------------------------------------------------------------------
// Tools
// -----------------------------------------------------------------------------

export const ListToolsRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  method: z.literal("tools/list"),
  params: PaginatedRequestParamsSchema.optional()
});

export const ListToolsResultSchema = z
  .object({
    tools: z.array(ToolSchema),
    nextCursor: CursorSchema.optional(),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const ListToolsResultResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  result: ListToolsResultSchema
});

export const CallToolRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  method: z.literal("tools/call"),
  params: RequestParamsSchema.extend({
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()).optional(),
    task: z.unknown().optional()
  }).passthrough()
});

export const CallToolResultSchema = z
  .object({
    content: z.array(ContentBlockSchema),
    structuredContent: z.record(z.string(), z.unknown()).optional(),
    isError: z.boolean().optional(),
    _meta: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const CallToolResultResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  result: CallToolResultSchema
});

export const ToolListChangedNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  method: z.literal("notifications/tools/list_changed"),
  params: NotificationParamsSchema.optional()
});

// -----------------------------------------------------------------------------
// Logging
// -----------------------------------------------------------------------------

export const LoggingLevelSchema = z.union([
  z.literal("debug"),
  z.literal("info"),
  z.literal("notice"),
  z.literal("warning"),
  z.literal("error"),
  z.literal("critical"),
  z.literal("alert"),
  z.literal("emergency")
]);

export const SetLevelRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: RequestIdSchema,
  method: z.literal("logging/setLevel"),
  params: RequestParamsSchema.extend({
    level: LoggingLevelSchema
  }).passthrough()
});

export const LoggingMessageNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  method: z.literal("notifications/message"),
  params: NotificationParamsSchema.extend({
    level: LoggingLevelSchema,
    logger: z.string().optional(),
    data: z.unknown()
  }).passthrough()
});
