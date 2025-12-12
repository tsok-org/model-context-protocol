import { Server, ToolsFeature, ResourcesFeature, PromptsFeature } from "model-context-protocol-sdk/server";
import {
	DistributedStreamableHttpServerTransport
} from "model-context-protocol-distributed-streamable-http-server-transport";
import { StandardSchemaValidator, defaultSchemaResolver } from "model-context-protocol-sdk/protocol";

import { getServerConfig } from "./lib/config";
import { createConsoleLogger } from "./lib/logger";
import { InMemoryEventBroker } from "./lib/event-broker/memory";
import { InMemorySessionManager } from "./lib/session-manager/memory";

const main = async (): Promise<void> => {
	const config = getServerConfig();
	const log = createConsoleLogger("info");

	const server = new Server({
		serverInfo: { name: "mcp-example-server", version: "0.1.0" },
		capabilities: {
			tools: { listChanged: true },
			resources: { subscribe: false, listChanged: true },
			prompts: { listChanged: true }
		},
		instructions: "Example MCP server built with model-context-protocol-sdk",
		schemaValidator: new StandardSchemaValidator(),
		schemaResolver: defaultSchemaResolver,
		enforceSchemaValidation: config.strictValidation
	});

	// --- Tools
	const tools = new ToolsFeature();
	tools.registerTool(
		{
			name: "echo",
			description: "Echo input back as text",
			inputSchema: {
				type: "object",
				properties: { text: { type: "string" } },
				required: ["text"]
			}
		},
		async (args: unknown) => {
			const text = (args as { text?: string }).text ?? "";
			return { content: [{ type: "text", text }] };
		}
	);

	tools.registerTool(
		{
			name: "triggerError",
			description: "Always returns an error result (useful for testing)",
			inputSchema: {
				type: "object",
				properties: { message: { type: "string" } },
				required: []
			}
		},
		async (args: unknown) => {
			const message = (args as { message?: string }).message ?? "Triggered error";
			return {
				content: [{ type: "text", text: message }],
				isError: true
			};
		}
	);

	server.addFeature(tools);

	// --- Resources
	const resources = new ResourcesFeature();
	resources.registerResource(
		{
			uri: "memory://hello",
			name: "hello",
			description: "A tiny in-memory resource"
		},
		async () => {
			return {
				contents: [{ uri: "memory://hello", mimeType: "text/plain", text: "Hello from the MCP example server" }]
			};
		}
	);
	server.addFeature(resources);

	// --- Prompts
	const prompts = new PromptsFeature();
	prompts.registerPrompt(
		{
			name: "hello",
			description: "A simple hello-world prompt",
			arguments: [{ name: "name", description: "Name to greet", required: false }]
		},
		async (args) => {
			const name = (args as { name?: string } | undefined)?.name ?? "world";
			return {
				description: "Hello prompt",
				messages: [{ role: "user", content: { type: "text", text: `Say hello to ${name}.` } }]
			};
		}
	);
	server.addFeature(prompts);

	const eventBroker = new InMemoryEventBroker();
	const sessions = new InMemorySessionManager();

	const transport = new DistributedStreamableHttpServerTransport({
		httpServer: {
			port: config.port,
			host: config.host,
			endpoint: config.endpoint
		},
		eventBroker,
		sessions
	});

	await server.connect(transport);

	log.info("MCP example server is running", {
		url: `http://${config.host}:${config.port}${config.endpoint}`,
		health: `http://${config.host}:${config.port}/health`,
		readiness: `http://${config.host}:${config.port}/readiness`,
		strictValidation: config.strictValidation
	});

	const shutdown = async (signal: string) => {
		log.info(`Shutting down (${signal})`);
		await server.close();
		await eventBroker.close();
		process.exit(0);
	};

	process.on("SIGINT", () => void shutdown("SIGINT"));
	process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

main().catch((err) => {
	// eslint-disable-next-line no-console
	console.error("Fatal error in MCP example server", err);
	process.exit(1);
});
