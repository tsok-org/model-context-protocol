/**
 * Prompts Feature
 *
 * Manages prompt registration and retrieval for MCP servers.
 */

import type { Prompt, GetPromptRequest, GetPromptResult, ListPromptsRequest, ListPromptsResult } from "../../protocol/types";
import { MethodNotFoundError, InvalidParamsError, InternalError } from "../../protocol/types";
import type { ServerFeature, ServerFeatureContext, ServerRequestHandler, ServerMessageContext, ServerMessageInfo } from "../types.js";

/**
 * Callback function for retrieving a prompt.
 */
export type PromptCallback<TArgs = { [key: string]: string }> = (
  args: TArgs | undefined,
  context: ServerMessageContext,
  info: ServerMessageInfo
) => Promise<GetPromptResult>;

/**
 * Internal handler for a registered prompt.
 */
interface PromptHandler {
  prompt: Prompt;
  get: PromptCallback;
}

/**
 * A feature that manages prompts and exposes them via the MCP protocol.
 */
export class PromptsFeature implements ServerFeature {
  public prompts: Map<string, PromptHandler> = new Map();
  public pageSize = 10;

  constructor(initialPrompts?: { prompt: Prompt; get: PromptCallback }[], pageSize?: number) {
    if (initialPrompts) {
      for (const { prompt, get } of initialPrompts) {
        this.registerPrompt(prompt, get);
      }
    }
    if (pageSize !== undefined) {
      this.pageSize = pageSize;
    }
  }

  /**
   * Registers a new prompt with the feature.
   * @param prompt The prompt definition.
   * @param get The callback to retrieve the prompt.
   */
  registerPrompt<TArgs = { [key: string]: string }>(prompt: Prompt, get: PromptCallback<TArgs>): void {
    if (this.prompts.has(prompt.name)) {
      throw new Error(`Prompt with name '${prompt.name}' already registered.`);
    }
    this.prompts.set(prompt.name, { prompt, get: get as PromptCallback });
  }

  initialize(context: ServerFeatureContext): void {
    const listPromptsHandler: ServerRequestHandler<ListPromptsRequest, ListPromptsResult> = async (_protocol, request, _context, _info) => {
      return this.handleListPrompts(request);
    };

    context.registerHandler("prompts/list", listPromptsHandler);

    const getPromptHandler: ServerRequestHandler<GetPromptRequest, GetPromptResult> = async (_protocol, request, context, info) => {
      return this.handleGetPrompt(request, context, info);
    };

    context.registerHandler("prompts/get", getPromptHandler);
  }

  private async handleListPrompts(request: ListPromptsRequest): Promise<ListPromptsResult> {
    const cursor = request.params?.cursor;
    let offset = 0;

    if (cursor) {
      try {
        offset = parseInt(Buffer.from(cursor, "base64").toString("utf-8"), 10);
      } catch {
        throw new InvalidParamsError("Invalid cursor");
      }
    }

    const allPrompts = Array.from(this.prompts.values()).map((h) => h.prompt);
    const pagedPrompts = allPrompts.slice(offset, offset + this.pageSize);
    const nextOffset = offset + this.pageSize;

    const result: ListPromptsResult = {
      prompts: pagedPrompts
    };

    if (nextOffset < allPrompts.length) {
      result.nextCursor = Buffer.from(nextOffset.toString()).toString("base64");
    }

    return result;
  }

  private async handleGetPrompt(
    request: GetPromptRequest,
    context: ServerMessageContext,
    info: ServerMessageInfo
  ): Promise<GetPromptResult> {
    const promptName = request.params.name;
    const handler = this.prompts.get(promptName);

    if (!handler) {
      throw new MethodNotFoundError(promptName);
    }

    try {
      return await handler.get(request.params.arguments, context, info);
    } catch (error) {
      throw new InternalError(`Error getting prompt '${promptName}': ${error}`);
    }
  }
}
