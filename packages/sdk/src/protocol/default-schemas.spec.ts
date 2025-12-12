import { StandardSchemaValidator, defaultSchemaResolver } from "./index";
import type { JSONRPCMessage } from "./schema";
import type { JsonSchema } from "./schema-validator";

describe("defaultSchemaResolver", () => {
  const validator = new StandardSchemaValidator();

  it("routes and validates tools/list request + response", async () => {
    const request: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    } as unknown as JSONRPCMessage;

    const requestSchema = defaultSchemaResolver(request, {});
    expect(requestSchema).toBeDefined();
    await validator.validate(request, requestSchema as unknown as JsonSchema<JSONRPCMessage, JSONRPCMessage>);

    const response: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [{ name: "hello", inputSchema: { type: "object" } }]
      }
    } as unknown as JSONRPCMessage;

    const responseSchema = defaultSchemaResolver(response, { requestMethod: "tools/list" });
    expect(responseSchema).toBeDefined();
    await validator.validate(response, responseSchema as unknown as JsonSchema<JSONRPCMessage, JSONRPCMessage>);
  });

  it("routes and validates prompts/get result content", async () => {
    const response: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 2,
      result: {
        messages: [{ role: "user", content: { type: "text", text: "hi" } }]
      }
    } as unknown as JSONRPCMessage;

    const schema = defaultSchemaResolver(response, { requestMethod: "prompts/get" });
    expect(schema).toBeDefined();
    await validator.validate(response, schema as unknown as JsonSchema<JSONRPCMessage, JSONRPCMessage>);
  });

  it("routes and validates notifications/message", async () => {
    const message: JSONRPCMessage = {
      jsonrpc: "2.0",
      method: "notifications/message",
      params: {
        level: "info",
        data: "hello"
      }
    } as unknown as JSONRPCMessage;

    const schema = defaultSchemaResolver(message, {});
    expect(schema).toBeDefined();
    await validator.validate(message, schema as unknown as JsonSchema<JSONRPCMessage, JSONRPCMessage>);
  });

  it("rejects invalid tools/list result items", async () => {
    const response: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [{ name: "missing-input-schema" }]
      }
    } as unknown as JSONRPCMessage;

    const schema = defaultSchemaResolver(response, { requestMethod: "tools/list" });
    expect(schema).toBeDefined();

    await expect(
      validator.validate(response, schema as unknown as JsonSchema<JSONRPCMessage, JSONRPCMessage>)
    ).rejects.toThrow(/inputSchema/i);
  });
});
