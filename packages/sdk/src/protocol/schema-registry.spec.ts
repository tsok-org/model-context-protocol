import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createSchemaResolver, type SchemaRegistry } from "./schema-registry";
import type { JSONRPCRequest, JSONRPCNotification, JSONRPCResultResponse } from "./schema";
import { isJSONRPCResponse } from "./assertions";

function makeSchema(id: string): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate() {
        return { value: id } as never;
      }
    }
  };
}

describe("createSchemaResolver", () => {
  it("routes request schemas by method (methods shape)", () => {
    const pingSchema = makeSchema("ping");

    const registry: SchemaRegistry = {
      methods: {
        ping: { request: pingSchema }
      }
    };

    const resolve = createSchemaResolver(registry);

    const msg: JSONRPCRequest = { jsonrpc: "2.0", id: 1, method: "ping" };

    expect(resolve(msg, { requestMethod: "ping" })).toBe(pingSchema);
  });

  it("routes result schemas by originating request method (methods shape)", () => {
    const initResultSchema = makeSchema("initialize-result");

    const registry: SchemaRegistry = {
      methods: {
        initialize: { result: initResultSchema }
      }
    };

    const resolve = createSchemaResolver(registry);

    const response: JSONRPCResultResponse = { jsonrpc: "2.0", id: 1, result: {} };

    expect(isJSONRPCResponse(response)).toBe(true);

    expect(resolve(response, { requestMethod: "initialize" })).toBe(initResultSchema);
  });

  it("routes notification schemas by method (methods shape)", () => {
    const progressSchema = makeSchema("progress");

    const registry: SchemaRegistry = {
      methods: {
        "notifications/progress": { notification: progressSchema }
      }
    };

    const resolve = createSchemaResolver(registry);

    const msg: JSONRPCNotification = { jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: 1, progress: 0 } };

    expect(resolve(msg, { requestMethod: msg.method })).toBe(progressSchema);
  });
});
