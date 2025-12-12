export interface Authentication {
  readonly token: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly expiresAt?: number;
  readonly resource?: URL;
  readonly extra?: Readonly<Record<string, unknown>>;
}
