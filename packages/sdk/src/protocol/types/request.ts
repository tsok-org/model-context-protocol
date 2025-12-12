import { RequestId, SessionId, TaskId } from "./schema";

export type SessionRoute = {
  readonly sessionId?: SessionId;
};

export type RequestRoute = {
  readonly requestId?: RequestId;
};

export type TaskRoute = {
  readonly taskId?: TaskId;
};

export type Route = SessionRoute & (RequestRoute | TaskRoute);

export interface Progress {
  readonly progress: number;
  readonly total?: number;
  readonly message?: string;
}

export type ProgressCallback = (progress: Progress) => void;

export interface RequestOptions {
  readonly route: Route;
  readonly onProgress?: ProgressCallback;
  readonly signal?: AbortSignal;
  readonly timeout?: number;
  readonly resetTimeoutOnProgress?: boolean;
  readonly maxTotalTimeout?: number;
}
