/**
 * Resources Feature
 *
 * Manages resource registration and retrieval for MCP servers.
 */

import type {
  Resource,
  ResourceTemplate,
  ListResourcesRequest,
  ListResourcesResult,
  ListResourceTemplatesRequest,
  ListResourceTemplatesResult,
  ReadResourceRequest,
  ReadResourceResult
} from "../../protocol/types";
import { MethodNotFoundError, InvalidParamsError, InternalError } from "../../protocol/types";
import type { ServerFeature, ServerFeatureContext, ServerRequestHandler, ServerMessageContext, ServerMessageInfo } from "../types.js";

/**
 * Callback function for reading a resource.
 */
export type ResourceCallback = (uri: string, context: ServerMessageContext, info: ServerMessageInfo) => Promise<ReadResourceResult>;

/**
 * Internal handler for a registered resource.
 */
interface ResourceHandler {
  resource: Resource;
  read: ResourceCallback;
}

/**
 * Internal handler for a registered resource template.
 */
interface ResourceTemplateHandler {
  template: ResourceTemplate;
  match: (uri: string) => boolean;
  read: ResourceCallback;
}

/**
 * A feature that manages resources and exposes them via the MCP protocol.
 */
export class ResourcesFeature implements ServerFeature {
  public resources: Map<string, ResourceHandler> = new Map();
  public templates: ResourceTemplateHandler[] = [];
  public pageSize = 10;

  constructor(
    initialResources?: { resource: Resource; read: ResourceCallback }[],
    initialTemplates?: { template: ResourceTemplate; read: ResourceCallback }[],
    pageSize?: number
  ) {
    if (initialResources) {
      for (const { resource, read } of initialResources) {
        this.registerResource(resource, read);
      }
    }
    if (initialTemplates) {
      for (const { template, read } of initialTemplates) {
        this.registerTemplate(template, read);
      }
    }
    if (pageSize !== undefined) {
      this.pageSize = pageSize;
    }
  }

  /**
   * Registers a new resource with the feature.
   * @param resource The resource definition.
   * @param read The callback to read the resource.
   */
  registerResource(resource: Resource, read: ResourceCallback): void {
    if (this.resources.has(resource.uri)) {
      throw new Error(`Resource with URI '${resource.uri}' already registered.`);
    }
    this.resources.set(resource.uri, { resource, read });
  }

  /**
   * Registers a new resource template with the feature.
   * @param template The resource template definition.
   * @param read The callback to read resources matching the template.
   */
  registerTemplate(template: ResourceTemplate, read: ResourceCallback): void {
    // Create a matcher function based on the URI template
    const match = this.createTemplateMatcher(template.uriTemplate);
    this.templates.push({ template, match, read });
  }

  /**
   * Creates a matcher function for a URI template.
   * Supports simple {param} patterns.
   */
  private createTemplateMatcher(uriTemplate: string): (uri: string) => boolean {
    // Convert template pattern to regex
    // e.g., "file://{path}" -> "^file://(.+)$"
    const regexPattern = uriTemplate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{[^}]+\\\}/g, "(.+)");
    const regex = new RegExp(`^${regexPattern}$`);
    return (uri: string) => regex.test(uri);
  }

  initialize(context: ServerFeatureContext): void {
    const listResourcesHandler: ServerRequestHandler<ListResourcesRequest, ListResourcesResult> = async (
      _protocol,
      request,
      _context,
      _info
    ) => {
      return this.handleListResources(request);
    };

    context.registerHandler("resources/list", listResourcesHandler);

    const listTemplatesHandler: ServerRequestHandler<ListResourceTemplatesRequest, ListResourceTemplatesResult> = async (
      _protocol,
      request,
      _context,
      _info
    ) => {
      return this.handleListTemplates(request);
    };

    context.registerHandler("resources/templates/list", listTemplatesHandler);

    const readResourceHandler: ServerRequestHandler<ReadResourceRequest, ReadResourceResult> = async (
      _protocol,
      request,
      context,
      info
    ) => {
      return this.handleReadResource(request, context, info);
    };

    context.registerHandler("resources/read", readResourceHandler);
  }

  private async handleListResources(request: ListResourcesRequest): Promise<ListResourcesResult> {
    const cursor = request.params?.cursor;
    let offset = 0;

    if (cursor) {
      try {
        offset = parseInt(Buffer.from(cursor, "base64").toString("utf-8"), 10);
      } catch {
        throw new InvalidParamsError("Invalid cursor");
      }
    }

    const allResources = Array.from(this.resources.values()).map((h) => h.resource);
    const pagedResources = allResources.slice(offset, offset + this.pageSize);
    const nextOffset = offset + this.pageSize;

    const result: ListResourcesResult = {
      resources: pagedResources
    };

    if (nextOffset < allResources.length) {
      result.nextCursor = Buffer.from(nextOffset.toString()).toString("base64");
    }

    return result;
  }

  private async handleListTemplates(request: ListResourceTemplatesRequest): Promise<ListResourceTemplatesResult> {
    const cursor = request.params?.cursor;
    let offset = 0;

    if (cursor) {
      try {
        offset = parseInt(Buffer.from(cursor, "base64").toString("utf-8"), 10);
      } catch {
        throw new InvalidParamsError("Invalid cursor");
      }
    }

    const allTemplates = this.templates.map((h) => h.template);
    const pagedTemplates = allTemplates.slice(offset, offset + this.pageSize);
    const nextOffset = offset + this.pageSize;

    const result: ListResourceTemplatesResult = {
      resourceTemplates: pagedTemplates
    };

    if (nextOffset < allTemplates.length) {
      result.nextCursor = Buffer.from(nextOffset.toString()).toString("base64");
    }

    return result;
  }

  private async handleReadResource(
    request: ReadResourceRequest,
    context: ServerMessageContext,
    info: ServerMessageInfo
  ): Promise<ReadResourceResult> {
    const uri = request.params.uri;

    // First check direct resources
    const directHandler = this.resources.get(uri);
    if (directHandler) {
      try {
        return await directHandler.read(uri, context, info);
      } catch (error) {
        throw new InternalError(`Error reading resource '${uri}': ${error}`);
      }
    }

    // Then check templates
    for (const templateHandler of this.templates) {
      if (templateHandler.match(uri)) {
        try {
          return await templateHandler.read(uri, context, info);
        } catch (error) {
          throw new InternalError(`Error reading resource '${uri}': ${error}`);
        }
      }
    }

    throw new MethodNotFoundError(uri);
  }
}
