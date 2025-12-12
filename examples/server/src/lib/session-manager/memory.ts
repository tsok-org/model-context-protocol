import { randomUUID } from "node:crypto";

import type {
  Session,
  SessionManager,
  SessionRequest
} from "model-context-protocol-distributed-streamable-http-server-transport";

class MemorySession implements Session {
  public readonly id: string;
  private readonly store = new Map<string, unknown>();

  constructor(id: string) {
    this.id = id;
  }

  getValue<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  setValue<T = unknown>(key: string, value: T): void {
    this.store.set(key, value);
  }

  deleteValue(key: string): void {
    this.store.delete(key);
  }
}

export class InMemorySessionManager implements SessionManager {
  private readonly sessions = new Map<string, MemorySession>();

  create(request: SessionRequest): Session {
    void request;
    const id = randomUUID();
    const session = new MemorySession(id);
    this.sessions.set(id, session);
    return session;
  }

  get(sessionId: string, request: SessionRequest): Session | undefined {
    void request;
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string, request: SessionRequest): void {
    void request;
    this.sessions.delete(sessionId);
  }
}
