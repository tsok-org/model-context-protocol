// =============================================================================
// ID Generator Interface
// =============================================================================

/**
 * Options for ID generation.
 */
export type IdGeneratorOptions = {
  /**
   * Optional prefix to prepend to the generated ID.
   */
  readonly prefix?: string;

  /**
   * Optional suffix to append to the generated ID.
   */
  readonly suffix?: string;

  /**
   * Desired length of the generated ID (excluding prefix/suffix).
   * Note: Some implementations (like UUID) may ignore this.
   */
  readonly length?: number;

  /**
   * The specific format or algorithm to use for generation.
   * Examples: "uuid", "nanoid", "numeric", "alphanumeric"
   */
  readonly format?: "uuid" | "numeric" | "alphanumeric" | string;
};

/**
 * Interface for generating unique request identifiers.
 * Implementations can provide custom ID generation strategies.
 */

export interface IdGenerator {
  /**
   * Generates a unique identifier for a request.
   * @param options Options for ID generation (e.g. prefix, length, format)
   * @returns A unique string identifier
   */
  generate(options?: IdGeneratorOptions): string;
}
