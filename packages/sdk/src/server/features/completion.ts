/**
 * Completion Feature
 *
 * Manages completion (autocomplete) functionality for MCP servers.
 * Provides suggestions for prompt arguments and resource template variables.
 */

import type { CompleteRequest, CompleteResult } from "../../protocol/types";
import { InvalidParamsError } from "../../protocol/types";
import type { ServerFeature, ServerFeatureContext, ServerRequestHandler, ServerMessageContext, ServerMessageInfo } from "../types.js";

/**
 * Callback function for providing completions.
 *
 * @param ref - The reference being completed (prompt or resource template)
 * @param argument - The argument being completed (name and current value)
 * @param context - Optional context with previously resolved arguments
 * @param messageContext - Server message context (session, logger, etc.)
 * @param info - Message metadata (method, sessionId, transport metadata)
 */
export type CompletionCallback = (
  ref: CompleteRequest["params"]["ref"],
  argument: CompleteRequest["params"]["argument"],
  context: CompleteRequest["params"]["context"],
  messageContext: ServerMessageContext,
  info: ServerMessageInfo
) => Promise<CompleteResult>;

/**
 * Internal handler for a registered completion provider.
 */
interface CompletionHandler {
  /** The reference type this handler matches (prompt name or resource URI template) */
  refKey: string;
  /** The completion callback */
  complete: CompletionCallback;
}

/**
 * Feature that enables completion (autocomplete) functionality on the server.
 *
 * Provides suggestions for:
 * - Prompt argument values (ref/prompt)
 * - Resource template URI variables (ref/resource)
 */
export class CompletionFeature implements ServerFeature {
  /** Registered completion handlers for prompts (keyed by prompt name) */
  public promptCompletions: Map<string, CompletionHandler> = new Map();

  /** Registered completion handlers for resource templates (keyed by URI template) */
  public resourceCompletions: Map<string, CompletionHandler> = new Map();

  constructor(
    initialPromptCompletions?: { promptName: string; complete: CompletionCallback }[],
    initialResourceCompletions?: { uriTemplate: string; complete: CompletionCallback }[]
  ) {
    if (initialPromptCompletions) {
      for (const { promptName, complete } of initialPromptCompletions) {
        this.registerPromptCompletion(promptName, complete);
      }
    }
    if (initialResourceCompletions) {
      for (const { uriTemplate, complete } of initialResourceCompletions) {
        this.registerResourceCompletion(uriTemplate, complete);
      }
    }
  }

  /**
   * Registers a completion provider for a prompt's arguments.
   * @param promptName The name of the prompt to provide completions for.
   * @param complete The callback to provide completion suggestions.
   */
  registerPromptCompletion(promptName: string, complete: CompletionCallback): void {
    if (this.promptCompletions.has(promptName)) {
      throw new Error(`Completion for prompt '${promptName}' already registered.`);
    }
    this.promptCompletions.set(promptName, { refKey: promptName, complete });
  }

  /**
   * Registers a completion provider for a resource template's variables.
   * @param uriTemplate The URI template to provide completions for.
   * @param complete The callback to provide completion suggestions.
   */
  registerResourceCompletion(uriTemplate: string, complete: CompletionCallback): void {
    if (this.resourceCompletions.has(uriTemplate)) {
      throw new Error(`Completion for resource template '${uriTemplate}' already registered.`);
    }
    this.resourceCompletions.set(uriTemplate, { refKey: uriTemplate, complete });
  }

  initialize(context: ServerFeatureContext): void {
    const completeHandler: ServerRequestHandler<CompleteRequest, CompleteResult> = async (_protocol, request, messageContext, info) => {
      return this.handleComplete(request, messageContext, info);
    };

    context.registerHandler("completion/complete", completeHandler);
  }

  private async handleComplete(request: CompleteRequest, context: ServerMessageContext, info: ServerMessageInfo): Promise<CompleteResult> {
    const { ref, argument, context: completionContext } = request.params;

    if (!ref || !argument) {
      throw new InvalidParamsError("Missing required parameters: ref and argument");
    }

    let handler: CompletionHandler | undefined;

    if (ref.type === "ref/prompt") {
      handler = this.promptCompletions.get(ref.name);
    } else if (ref.type === "ref/resource") {
      handler = this.resourceCompletions.get(ref.uri);
    }

    if (!handler) {
      // Return empty result if no handler registered (not an error per spec)
      return this.emptyResult();
    }

    try {
      const result = await handler.complete(ref, argument, completionContext, context, info);
      // Ensure we don't exceed 100 items per spec
      if (result.completion.values.length > 100) {
        return {
          completion: {
            values: result.completion.values.slice(0, 100),
            total: result.completion.total ?? result.completion.values.length,
            hasMore: true
          }
        };
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new InvalidParamsError(`Completion error: ${errorMessage}`);
    }
  }

  /**
   * Returns an empty completion result.
   */
  private emptyResult(): CompleteResult {
    return {
      completion: {
        values: [],
        hasMore: false
      }
    };
  }
}

/**
 * Legacy Completion interface for backwards compatibility.
 * @deprecated Use CompletionFeature class instead.
 */
export interface Completion<TContext extends object = object> {
  complete?: (request: CompleteRequest, context: ServerMessageContext<TContext>, info: ServerMessageInfo) => Promise<CompleteResult>;
}
