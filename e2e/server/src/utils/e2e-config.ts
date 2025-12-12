export type E2eServerConfig = {
  readonly baseUrl: URL;
  readonly endpointPath: string;
  readonly endpointUrl: URL;
  readonly healthUrl: URL;
  readonly readinessUrl: URL;
};

const isValidHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const getE2eServerConfig = (): E2eServerConfig => {
  const baseUrlValue = process.env.MCP_E2E_BASE_URL ?? 'http://127.0.0.1:3333';
  if (!isValidHttpUrl(baseUrlValue)) {
    throw new Error(`Invalid MCP_E2E_BASE_URL: ${baseUrlValue}`);
  }

  const endpointPath = process.env.MCP_E2E_ENDPOINT ?? '/mcp';
  if (!endpointPath.startsWith('/')) {
    throw new Error(`Invalid MCP_E2E_ENDPOINT (must start with '/'): ${endpointPath}`);
  }

  const baseUrl = new URL(baseUrlValue);
  const endpointUrl = new URL(endpointPath, baseUrl);
  const healthUrl = new URL('/health', baseUrl);
  const readinessUrl = new URL('/readiness', baseUrl);

  return { baseUrl, endpointPath, endpointUrl, healthUrl, readinessUrl };
};
