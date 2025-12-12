import { randomUUID } from "node:crypto";
import { IdGenerator } from "./types/id";

/**
 * Default implementation of IdGenerator using UUIDs.
 */
export class DefaultIdGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}
