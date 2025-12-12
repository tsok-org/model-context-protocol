// =============================================================================
// Schema Validator Interface
// =============================================================================
/**
 * Interface for a schema validator.
 */

import { JSONRPCMessage } from "./types";

type JsonSchema = unknown; // TODO: Replace with Standard Schema https://www.npmjs.com/package/@standard-schema/spec

export interface SchemaValidator {
  /**
   * Validates a message against the schema.
   * Throws an error if the message is invalid.
   */
  validate<TMessage extends JSONRPCMessage>(message: TMessage, schema: JsonSchema): void;
}
