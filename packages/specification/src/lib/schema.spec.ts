import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from './schema';

describe('specification schema exports', () => {
  it('exports JSONRPC_VERSION', () => {
    expect(JSONRPC_VERSION).toEqual('2.0');
  });

  it('exports LATEST_PROTOCOL_VERSION', () => {
    expect(typeof LATEST_PROTOCOL_VERSION).toBe('string');
    expect(LATEST_PROTOCOL_VERSION.length).toBeGreaterThan(0);
  });
});
