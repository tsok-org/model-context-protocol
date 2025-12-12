export type ServerConfig = {
  readonly host: string;
  readonly port: number;
  readonly endpoint: string;
  readonly strictValidation: boolean;
};

const readBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return defaultValue;
};

const readNumber = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

export const getServerConfig = (): ServerConfig => {
  return {
    host: process.env.MCP_SERVER_HOST ?? "0.0.0.0",
    port: readNumber(process.env.MCP_SERVER_PORT, 3333),
    endpoint: process.env.MCP_SERVER_ENDPOINT ?? "/mcp",
    strictValidation: readBoolean(process.env.MCP_STRICT_VALIDATION, false)
  };
};
