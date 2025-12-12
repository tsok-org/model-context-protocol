type ReadinessResponse = {
  readonly status: 'ready' | string;
  readonly listening?: boolean;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isReadinessResponse = (value: unknown): value is ReadinessResponse => {
  if (!isObjectRecord(value)) return false;

  const status = value['status'];
  if (typeof status !== 'string') return false;

  const listening = value['listening'];
  if (listening !== undefined && typeof listening !== 'boolean') return false;

  return true;
};

export const waitForHealthyAndReady = async (options: {
  readonly healthUrl: URL;
  readonly readinessUrl: URL;
  readonly timeoutMs?: number;
}): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const startedAt = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > timeoutMs) {
      throw new Error(
        `Timed out waiting for server. health=${options.healthUrl.toString()} readiness=${options.readinessUrl.toString()}`
      );
    }

    try {
      const health = await fetch(options.healthUrl);
      if (!health.ok) {
        await sleep(100);
        continue;
      }

      const readiness = await fetch(options.readinessUrl);
      if (!readiness.ok) {
        await sleep(100);
        continue;
      }

      const bodyText = await readiness.text();
      const bodyJson: unknown = bodyText.length === 0 ? {} : JSON.parse(bodyText);

      if (!isReadinessResponse(bodyJson)) {
        await sleep(100);
        continue;
      }

      if (bodyJson.status === 'ready' && bodyJson.listening === true) {
        return;
      }
    } catch {
      // ignore transient failures
    }

    await sleep(100);
  }
};
