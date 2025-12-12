/**
 * Session Manager
 *
 * Simple CRUD interface for session management.
 * Handles session lifecycle: create, get, delete.
 */

import type { SessionId, Session, ClientCapabilities, ServerCapabilities, Implementation } from "./types";

/**
 * Options for creating a new session.
 */
export interface SessionCreateOptions {
  /** Optional session ID (generated if not provided) */
  readonly id?: SessionId;

  /** Time-to-live in milliseconds (session expires after this) */
  readonly ttl?: number;
}

/**
 * Session initialization data.
 */
export interface SessionInitializeData {
  readonly protocolVersion: string;
  readonly clientInfo: Implementation;
  readonly serverInfo: Implementation;
  readonly clientCapabilities: ClientCapabilities;
  readonly serverCapabilities: ServerCapabilities;
}

/**
 * Session manager options.
 */
export interface SessionManagerOptions {
  /**
   * Default session TTL in milliseconds.
   * @default 3600000 (1 hour)
   */
  readonly defaultTtl?: number;
}

/**
 * Session manager interface.
 */
export interface SessionManager {
  /**
   * Create a new session.
   */
  create(options?: SessionCreateOptions): Session;

  /**
   * Get a session by ID.
   * @throws SessionNotFoundError if session doesn't exist
   */
  get(id: SessionId): Session;

  /**
   * Delete a session.
   * @returns true if session was deleted, false if it didn't exist
   */
  delete(id: SessionId): boolean;
}

/**
 * Protocol events.
 */
export interface Events {
  onSessionCreated?(session: Session): void;
  onSessionInitialized?(session: Session): void;
  onSessionDeleted?(session: Session): void;
  onSessionExpired?(session: Session): void;
}
