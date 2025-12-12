import { SessionState } from 'model-context-protocol-sdk/protocol';

import type {
  IncomingMessageContext,
  IncomingMessageInfo,
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  JsonValue,
  Session,
  Transport,
  TransportSendOptions
} from 'model-context-protocol-sdk/protocol';

type ClientTransportContext = {
  readonly instanceId: string;
};

class InMemorySession implements Session {
  public readonly createdAt: Date;
  public updatedAt: Date;
  public expiredAt?: Date;
  public deletedAt?: Date;

  public protocolVersion?: string;
  public clientInfo?: Session['clientInfo'];
  public serverInfo?: Session['serverInfo'];
  public clientCapabilities?: Session['clientCapabilities'];
  public serverCapabilities?: Session['serverCapabilities'];

  private readonly data = new Map<string, JsonValue>();

  public constructor(public readonly id: string, public readonly state: SessionState = SessionState.Created) {
    const now = new Date();
    this.createdAt = now;
    this.updatedAt = now;
  }

  public getValue<T = JsonValue>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  public setValue<T = JsonValue>(key: string, value: T): void {
    this.data.set(key, value as JsonValue);
    this.updatedAt = new Date();
  }

  public deleteValue(key: string): void {
    this.data.delete(key);
    this.updatedAt = new Date();
  }
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isJsonRpcBase = (value: unknown): value is { readonly jsonrpc: '2.0' } => {
  return isObjectRecord(value) && value['jsonrpc'] === '2.0';
};

const isJsonRpcRequest = (value: unknown): value is JSONRPCRequest => {
  if (!isJsonRpcBase(value)) return false;
  return typeof value['method'] === 'string' && 'id' in value;
};

const isJsonRpcNotification = (value: unknown): value is JSONRPCNotification => {
  if (!isJsonRpcBase(value)) return false;
  return typeof value['method'] === 'string' && !('id' in value);
};

const isJsonRpcResponse = (value: unknown): value is JSONRPCResponse => {
  if (!isJsonRpcBase(value)) return false;
  return 'result' in value || 'error' in value;
};

const isJsonRpcMessage = (value: unknown): value is JSONRPCMessage => {
  return isJsonRpcRequest(value) || isJsonRpcNotification(value) || isJsonRpcResponse(value);
};

export class JsonOnlyStreamableHttpClientTransport
  implements
    Transport<
      JSONRPCMessage,
      IncomingMessageContext<ClientTransportContext>,
      IncomingMessageInfo,
      JSONRPCMessage | JSONRPCResponse
    >
{
  public messageHandler?: (
    message: JSONRPCMessage,
    context: IncomingMessageContext<ClientTransportContext>,
    info: IncomingMessageInfo
  ) => Promise<void> | void;

  private sessionId: string | undefined;

  public constructor(private readonly endpointUrl: URL, options?: { readonly sessionId?: string }) {
    this.sessionId = options?.sessionId;
  }

  public getSessionId(): string | undefined {
    return this.sessionId;
  }

  public async connect(): Promise<void> {
    return;
  }

  public async disconnect(): Promise<void> {
    return;
  }

  public async send(message: JSONRPCMessage | JSONRPCResponse, options?: TransportSendOptions): Promise<void> {
    const requestSessionId = options?.sessionId ?? this.sessionId;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json'
    };

    if (requestSessionId) {
      headers['mcp-session-id'] = requestSessionId;
    }

    const res = await fetch(this.endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(message)
    });

    const maybeNewSessionId = res.headers.get('mcp-session-id') ?? undefined;
    if (maybeNewSessionId && !this.sessionId) {
      this.sessionId = maybeNewSessionId;
    }

    // Notifications return 202/204 with empty body.
    if (res.status === 202 || res.status === 204) {
      return;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      const body = await res.text().catch(() => '');
      throw new Error(`Unexpected content-type: ${contentType}. Body: ${body}`);
    }

    const payload: unknown = await res.json();
    const rawMessages: unknown[] = Array.isArray(payload) ? payload : [payload];
    const messages: JSONRPCMessage[] = [];

    for (const raw of rawMessages) {
      if (!isJsonRpcMessage(raw)) {
        throw new Error('Server returned a non-JSON-RPC message');
      }
      messages.push(raw);
    }

    if (!this.messageHandler) {
      return;
    }

    const context: IncomingMessageContext<ClientTransportContext> = {
      instanceId: 'e2e-client',
      ...(options?.sessionId ? { session: new InMemorySession(options.sessionId) } : {})
    };

    const info: IncomingMessageInfo = {
      timestamp: new Date()
    };

    for (const msg of messages) {
      await this.messageHandler(msg, context, info);
    }
  }
}
