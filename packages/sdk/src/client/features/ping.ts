/**
 * Ping Feature (Client)
 *
 * Handles ping requests from the server.
 */

import type { PingRequest, EmptyResult } from "../../protocol/types";
import type { ClientFeature, ClientFeatureContext, ClientRequestHandler } from "../types.js";

/**
 * Feature that enables handling of ping requests from the server.
 */
export class PingFeature implements ClientFeature {
  initialize(context: ClientFeatureContext): void {
    const pingHandler: ClientRequestHandler<PingRequest, EmptyResult> = async (_protocol, _request, _context, _info) => {
      return {};
    };

    context.registerHandler("ping", pingHandler);
  }
}
