import type { JSONRPCMessage, JSONRPCNotification, JSONRPCRequest } from "./types";
import type { JsonSchema, SchemaResolver, SchemaResolverContext } from "./schema-validator";
import { isJSONRPCError, isJSONRPCNotification, isJSONRPCRequest, isJSONRPCResponse } from "./assertions";

export type MethodSchemaRegistryEntry = {
  /** Schema for a JSON-RPC request with this method name. */
  readonly request?: JsonSchema;

  /** Schema for a JSON-RPC notification with this method name. */
  readonly notification?: JsonSchema;

  /** Schema for a JSON-RPC *result response* for a request with this method name. */
  readonly result?: JsonSchema;

  /** Schema for a JSON-RPC *error response* for a request with this method name. */
  readonly error?: JsonSchema;
};

export type SchemaRegistry = {
  /**
   * Method-keyed schemas.
   *
   * - For requests/notifications: key is the message's `method`.
   * - For responses/errors: key is `context.requestMethod` (the originating request method).
   */
  readonly methods?: Readonly<Record<string, MethodSchemaRegistryEntry>>;

  /** Fallback schemas used when an exact key is not present. */
  readonly fallback?: {
    readonly request?: JsonSchema;
    readonly notification?: JsonSchema;
    /** Fallback schema for JSON-RPC *result responses*. */
    readonly result?: JsonSchema;
    readonly error?: JsonSchema;
  };
};

export type CreateSchemaResolverOptions = {
  /** If true, require requestMethod for responses/errors to do method-specific mapping. */
  readonly requireRequestMethodForResponseLookup?: boolean;
};

/**
 * Creates a SchemaResolver from a declarative schema registry.
 *
 * This is intentionally small and unopinionated: you can plug in Zod/Valibot/ArkType schemas
 * (anything that implements Standard Schema) and get consistent validation routing.
 */
export function createSchemaResolver(
  registry: SchemaRegistry,
  options?: CreateSchemaResolverOptions
): SchemaResolver {
  const requireRequestMethodForResponseLookup = options?.requireRequestMethodForResponseLookup ?? false;

  return (message: JSONRPCMessage, context: SchemaResolverContext): JsonSchema | undefined => {
    const fallbackResult = registry.fallback?.result;

    if (isJSONRPCRequest(message)) {
      const method = (message as JSONRPCRequest).method;
      return registry.methods?.[method]?.request ?? registry.fallback?.request;
    }

    if (isJSONRPCNotification(message)) {
      const method = (message as JSONRPCNotification).method;
      return registry.methods?.[method]?.notification ?? registry.fallback?.notification;
    }

    if (isJSONRPCResponse(message)) {
      const requestMethod = context.requestMethod;
      if (requestMethod) {
        return registry.methods?.[requestMethod]?.result ?? fallbackResult;
      }
      return requireRequestMethodForResponseLookup ? undefined : fallbackResult;
    }

    if (isJSONRPCError(message)) {
      const requestMethod = context.requestMethod;
      if (requestMethod) {
        return registry.methods?.[requestMethod]?.error ?? registry.fallback?.error;
      }
      return requireRequestMethodForResponseLookup ? undefined : registry.fallback?.error;
    }

    return undefined;
  };
}
