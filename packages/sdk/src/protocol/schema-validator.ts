// =============================================================================
// Schema Validator Interface
// =============================================================================
/**
 * Interface for a schema validator.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { JSONRPCMessage } from "./types";

export type JsonSchema<TInput = unknown, TOutput = TInput> = StandardSchemaV1<TInput, TOutput>;

export type SchemaResolverContext = {
  /**
   * When validating a response/error, this is the method of the original request if known.
   */
  readonly requestMethod?: string;
};

export type SchemaResolver = (message: JSONRPCMessage, context: SchemaResolverContext) => JsonSchema | undefined;

export interface SchemaValidator {
  /**
   * Validates a message against the schema.
   * Throws an error if the message is invalid.
   */
  validate<TMessage extends JSONRPCMessage>(message: unknown, schema: JsonSchema<TMessage, TMessage>): void | Promise<void>;
}

export class StandardSchemaValidator implements SchemaValidator {
  public async validate<TMessage extends JSONRPCMessage>(message: unknown, schema: JsonSchema<TMessage, TMessage>): Promise<void> {
    let result = schema["~standard"].validate(message);
    if (result instanceof Promise) {
      result = await result;
    }

    if (result.issues) {
      const formatted = result.issues
        .map((issue: StandardSchemaV1.Issue) => {
          const path = issue.path
            ?.map((segment: PropertyKey | StandardSchemaV1.PathSegment) =>
              typeof segment === "object" && segment && "key" in segment ? segment.key : segment
            )
            .map((segment: PropertyKey) => String(segment))
            .join(".");
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join("\n");
      throw new Error(formatted || "Schema validation failed");
    }
  }
}
