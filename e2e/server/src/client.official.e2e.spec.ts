import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { getE2eServerConfig } from './utils/e2e-config';

describe('e2e: official client vs example server', () => {
  it('can call tools/resources/prompts against our server', async () => {
    const { endpointUrl } = getE2eServerConfig();

    const transport = new StreamableHTTPClientTransport(endpointUrl);
    const client = new Client(
      {
        name: 'e2e-official',
        version: '0.0.0'
      },
      {
        capabilities: {}
      }
    );

    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('echo');
    expect(toolNames).toContain('triggerError');

    const call = await client.callTool({
      name: 'echo',
      arguments: { text: 'hello' }
    });
    expect(call.isError).not.toBe(true);
    expect(call.content?.[0]?.type).toBe('text');

    const read = await client.readResource({ uri: 'memory://hello' });
    expect(read.contents?.[0]?.uri).toBe('memory://hello');

    const prompt = await client.getPrompt({
      name: 'hello',
      arguments: { name: 'Alice' }
    });
    expect(prompt.messages?.[0]?.role).toBe('user');

    await client.close();
  }, 30_000);
});
