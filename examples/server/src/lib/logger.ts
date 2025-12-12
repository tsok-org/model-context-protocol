export type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export const createConsoleLogger = (level: LogLevel = "info") => {
  const min = levelOrder[level];

  const write = (lvl: LogLevel, message: string, meta?: unknown) => {
    if (levelOrder[lvl] < min) return;
    const prefix = `[mcp-example][${lvl}]`;
    if (meta === undefined) {
      // eslint-disable-next-line no-console
      console.log(prefix, message);
    } else {
      // eslint-disable-next-line no-console
      console.log(prefix, message, meta);
    }
  };

  return {
    debug: (m: string, meta?: unknown) => write("debug", m, meta),
    info: (m: string, meta?: unknown) => write("info", m, meta),
    warn: (m: string, meta?: unknown) => write("warn", m, meta),
    error: (m: string, meta?: unknown) => write("error", m, meta)
  };
};
