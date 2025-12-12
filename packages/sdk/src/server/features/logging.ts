/**
 * Logging Feature Interface
 *
 * Interface for logging functionality in MCP servers.
 */

import type { LoggingLevel, Result } from "../../protocol/types";
import type { ServerMessageContext, ServerMessageInfo } from "../types.js";

/**
 * Logging feature handlers for MCP servers.
 */
export type Logging<TContext extends object = object> = {
  setLevel?: (request: { level: LoggingLevel }, context: ServerMessageContext<TContext>, info: ServerMessageInfo) => Promise<Result>;
};
