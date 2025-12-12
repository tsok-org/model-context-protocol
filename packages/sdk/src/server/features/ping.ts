/**
 * Ping Feature
 *
 * Provides a basic ping/pong mechanism for MCP servers.
 */

import type { PingRequest, EmptyResult } from "../../protocol/types";
import type { ServerFeature, ServerFeatureContext, ServerRequestHandler } from "../types.js";

/**
 * A feature that handles ping requests.
 */
export class PingFeature implements ServerFeature {
  initialize(context: ServerFeatureContext): void {
    const pingHandler: ServerRequestHandler<PingRequest, EmptyResult> = async (_protocol, _request, _context, _info) => {
      return {};
    };

    context.registerHandler("ping", pingHandler);
  }
}
