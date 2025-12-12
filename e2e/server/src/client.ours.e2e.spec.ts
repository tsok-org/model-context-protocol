import { Client } from 'model-context-protocol-sdk/client';
import type {
  CallToolRequest,
  GetPromptRequest,
  InitializedNotification,
  InitializeRequest,
  ListToolsRequest,
  ReadResourceRequest
} from 'model-context-protocol-sdk/protocol';

import { getE2eServerConfig } from './utils/e2e-config';
import { JsonOnlyStreamableHttpClientTransport } from './streamable-http-client-transport';

describe('e2e: ours client vs example server', () => {
  it('initializes session and can call tools/resources/prompts', async () => {
    const { endpointUrl } = getE2eServerConfig();
    const transport = new JsonOnlyStreamableHttpClientTransport(endpointUrl);

    const client = new Client();
    await client.connect(transport);

    const init = await client.request<InitializeRequest>(
      {
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          clientInfo: { name: 'e2e-ours', version: '0.0.0' },
          capabilities: {}
        }
      },
      { route: {} }
    );

    expect(init.serverInfo?.name).toBe('mcp-example-server');

    const sessionId = transport.getSessionId();
    if (!sessionId) {
      throw new Error('Expected transport sessionId after initialize');
    }

    const initialized: Omit<InitializedNotification, 'jsonrpc'> = {
      method: 'notifications/initialized',
      params: {}
    };
    await client.notification(initialized, { route: { sessionId } });

    const tools = await client.request<ListToolsRequest>(
      {
        method: 'tools/list',
        params: {}
      },
      { route: { sessionId } }
    );

    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('echo');
    expect(toolNames).toContain('triggerError');

    const call = await client.request<CallToolRequest>(
      {
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: { text: 'hello' }
        }
      },
      { route: { sessionId } }
    );

    expect(call.isError).not.toBe(true);
    expect(call.content?.[0]?.type).toBe('text');

    const read = await client.request<ReadResourceRequest>(
      {
        method: 'resources/read',
        params: { uri: 'memory://hello' }
      },
      { route: { sessionId } }
    );
    expect(read.contents?.[0]?.uri).toBe('memory://hello');

    const prompt = await client.request<GetPromptRequest>(
      {
        method: 'prompts/get',
        params: { name: 'hello', arguments: { name: 'Alice' } }
      },
      { route: { sessionId } }
    );
    expect(prompt.messages?.[0]?.role).toBe('user');

    await client.close();
  }, 30_000);
});
