/**
 * Tools Feature
 *
 * Manages tool registration and execution for MCP servers.
 */

import type { Tool, CallToolResult, CallToolRequest, ListToolsResult, ListToolsRequest } from "../../protocol/types";
import { MethodNotFoundError, InvalidParamsError } from "../../protocol/types";
import type { ServerFeature, ServerFeatureContext, ServerRequestHandler, ServerMessageContext, ServerMessageInfo } from "../types.js";

/**
 * Callback function for executing a tool.
 */
export type ToolCallback<TArgs = unknown> = (
  args: TArgs,
  context: ServerMessageContext,
  info: ServerMessageInfo
) => Promise<CallToolResult>;

/**
 * Internal interface for storing a registered tool and its handler.
 */
interface ToolHandler {
  tool: Tool;
  execute: ToolCallback;
}

/**
 * Feature that enables tool management and execution on the server.
 */
export class ToolsFeature implements ServerFeature {
  public tools: Map<string, ToolHandler> = new Map();
  public pageSize = 10;

  constructor(initialTools?: { tool: Tool; execute: ToolCallback }[], pageSize?: number) {
    if (initialTools) {
      for (const { tool, execute } of initialTools) {
        this.registerTool(tool, execute);
      }
    }
    if (pageSize !== undefined) {
      this.pageSize = pageSize;
    }
  }

  /**
   * Registers a new tool with the feature.
   * @param tool The tool definition.
   * @param execute The callback to execute when the tool is called.
   */
  registerTool<TArgs = unknown>(tool: Tool, execute: ToolCallback<TArgs>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name '${tool.name}' already registered.`);
    }
    this.tools.set(tool.name, { tool, execute: execute as ToolCallback });
  }

  initialize(context: ServerFeatureContext): void {
    const listToolsHandler: ServerRequestHandler<ListToolsRequest, ListToolsResult> = async (_protocol, request, _context, _info) => {
      return this.handleListTools(request);
    };

    context.registerHandler("tools/list", listToolsHandler);

    const callToolHandler: ServerRequestHandler<CallToolRequest, CallToolResult> = async (_protocol, request, context, info) => {
      return this.handleCallTool(request, context, info);
    };

    context.registerHandler("tools/call", callToolHandler);
  }

  private async handleListTools(request: ListToolsRequest): Promise<ListToolsResult> {
    const cursor = request.params?.cursor;
    let offset = 0;

    if (cursor) {
      try {
        offset = parseInt(Buffer.from(cursor, "base64").toString("utf-8"), 10);
      } catch {
        throw new InvalidParamsError("Invalid cursor");
      }
    }

    const allTools = Array.from(this.tools.values()).map((h) => h.tool);
    const pagedTools = allTools.slice(offset, offset + this.pageSize);
    const nextOffset = offset + this.pageSize;

    const result: ListToolsResult = {
      tools: pagedTools
    };

    if (nextOffset < allTools.length) {
      result.nextCursor = Buffer.from(nextOffset.toString()).toString("base64");
    }

    return result;
  }

  private async handleCallTool(request: CallToolRequest, context: ServerMessageContext, info: ServerMessageInfo): Promise<CallToolResult> {
    const toolName = request.params.name;
    const handler = this.tools.get(toolName);

    if (!handler) {
      throw new MethodNotFoundError(toolName);
    }

    try {
      return await handler.execute(request.params.arguments, context, info);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error executing tool '${toolName}': ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
}
