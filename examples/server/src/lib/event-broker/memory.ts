import { randomUUID } from "node:crypto";

import type {
  BrokerMessage,
  EventBroker,
  EventId,
  MessageMeta,
  Subscription,
  SubscriptionOptions,
  Topic
} from "model-context-protocol-distributed-streamable-http-server-transport";

type StoredMessage = {
  readonly id: EventId;
  readonly data: unknown;
  readonly meta: MessageMeta;
};

type Subscriber = {
  readonly pattern: string;
  readonly queueGroup?: string;
  readonly push: (msg: StoredMessage) => void;
  readonly close: () => void;
};

const tokenize = (subject: string): string[] => subject.split(".");

// NATS-like wildcard matching:
// - * matches exactly one token
// - > matches the rest of the tokens (must be last)
const subjectMatches = (pattern: string, subject: string): boolean => {
  const p = tokenize(pattern);
  const s = tokenize(subject);

  for (let i = 0, j = 0; i < p.length; i++, j++) {
    const token = p[i];
    if (token === ">") {
      return true;
    }
    if (j >= s.length) return false;
    if (token === "*") continue;
    if (token !== s[j]) return false;
  }

  return p.length === s.length;
};

class AsyncQueue<T> {
  private readonly items: T[] = [];
  private resolvers: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ value: item, done: false });
      return;
    }
    this.items.push(item);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as never, done: true });
    }
    this.resolvers = [];
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.items.length > 0) {
      const item = this.items.shift();
      if (item === undefined) {
        return { value: undefined as never, done: true };
      }
      return { value: item, done: false };
    }
    if (this.closed) {
      return { value: undefined as never, done: true };
    }
    return await new Promise<IteratorResult<T>>((resolve) => this.resolvers.push(resolve));
  }
}

class MemorySubscription<TData> implements Subscription<TData> {
  private readonly queue = new AsyncQueue<BrokerMessage<TData>>();
  private unsubscribed = false;

  constructor(private readonly unsubscribeImpl: () => void) {}

  push(msg: BrokerMessage<TData>): void {
    this.queue.push(msg);
  }

  async unsubscribe(): Promise<void> {
    if (this.unsubscribed) return;
    this.unsubscribed = true;
    this.unsubscribeImpl();
    this.queue.close();
  }

  async ready(): Promise<void> {
    return;
  }

  [Symbol.asyncIterator](): AsyncIterator<BrokerMessage<TData>> {
    return {
      next: async () => this.queue.next()
    };
  }
}

export class InMemoryEventBroker implements EventBroker {
  private sequence = 0;

  // Store by subject so we can replay from a Last-Event-ID.
  private readonly history = new Map<string, StoredMessage[]>();

  private readonly subscribers = new Map<string, Subscriber>();

  // Round-robin state per (pattern, queueGroup)
  private readonly rrIndex = new Map<string, number>();

  async publish<TParams, TData>(topic: Topic<TParams, TData>, params: TParams, data: TData): Promise<EventId> {
    const subject = topic.subject(params);
    const id = String(++this.sequence);

    const meta: MessageMeta = {
      timestamp: Date.now(),
      subject,
      deliveryAttempt: 1
    };

    const stored: StoredMessage = { id, data, meta };

    const list = this.history.get(subject);
    if (list) list.push(stored);
    else this.history.set(subject, [stored]);

    // Fan-out to matching subscribers; if queueGroup is set, deliver to one subscriber in that group.
    const matching = Array.from(this.subscribers.values()).filter((sub) => subjectMatches(sub.pattern, subject));

    const grouped = new Map<string, Subscriber[]>();
    const ungrouped: Subscriber[] = [];

    for (const sub of matching) {
      if (!sub.queueGroup) {
        ungrouped.push(sub);
        continue;
      }
      const key = `${sub.pattern}::${sub.queueGroup}`;
      const arr = grouped.get(key);
      if (arr) arr.push(sub);
      else grouped.set(key, [sub]);
    }

    for (const sub of ungrouped) {
      sub.push(stored);
    }

    for (const [key, subs] of grouped) {
      const idx = (this.rrIndex.get(key) ?? 0) % subs.length;
      this.rrIndex.set(key, idx + 1);
      subs[idx]?.push(stored);
    }

    return id;
  }

  subscribe<TParams, TData>(topic: Topic<TParams, TData>, params: TParams, options?: SubscriptionOptions): Subscription<TData> {
    const pattern = topic.subject(params);
    const queueGroup = options?.queueGroup;

    const subscriberId = randomUUID();
    const queue = new MemorySubscription<TData>(() => {
      this.subscribers.delete(subscriberId);
    });

    const push = (stored: StoredMessage) => {
      const msg: BrokerMessage<TData> = {
        id: stored.id,
        data: stored.data as TData,
        meta: stored.meta,
        ack: () => Promise.resolve(),
        nack: async (delayMs?: number) => {
          // Best-effort re-delivery for local testing.
          if (delayMs && delayMs > 0) {
            setTimeout(() => {
              if (!this.subscribers.has(subscriberId)) return;
              queue.push(msg);
            }, delayMs);
            return;
          }
          if (!this.subscribers.has(subscriberId)) return;
          queue.push(msg);
        }
      };
      queue.push(msg);
    };

    this.subscribers.set(subscriberId, {
      pattern,
      queueGroup,
      push,
      close: () => void queue.unsubscribe()
    });

    // Replay from history if requested.
    const fromEventId = options?.fromEventId;
    if (fromEventId !== undefined) {
      const from = Number(fromEventId);
      for (const [subject, messages] of this.history.entries()) {
        if (!subjectMatches(pattern, subject)) continue;
        for (const stored of messages) {
          const seq = Number(stored.id);
          if (Number.isFinite(from) && Number.isFinite(seq) && seq <= from) continue;
          push(stored);
        }
      }
    }

    return queue;
  }

  async close(): Promise<void> {
    for (const sub of this.subscribers.values()) {
      sub.close();
    }
    this.subscribers.clear();
    this.history.clear();
  }
}
