import { getE2eServerConfig } from './utils/e2e-config';
import { waitForHealthyAndReady } from './utils/wait-for-server';

declare global {
  // eslint-disable-next-line no-var
  var __MCP_SERVER_READY_PROMISE__: Promise<void> | undefined;
}

const ensureServerReady = (): Promise<void> => {
  if (!globalThis.__MCP_SERVER_READY_PROMISE__) {
    const cfg = getE2eServerConfig();
    globalThis.__MCP_SERVER_READY_PROMISE__ = waitForHealthyAndReady({
      healthUrl: cfg.healthUrl,
      readinessUrl: cfg.readinessUrl,
      timeoutMs: 30_000
    });
  }
  return globalThis.__MCP_SERVER_READY_PROMISE__;
};

beforeAll(async () => {
  await ensureServerReady();
}, 35_000);
//
