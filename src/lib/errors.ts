interface RomanceErrorConfig {
  [key: string]: unknown;
  cause?: Error;
  phase?: string;
  context?: unknown;
}

/**
 * Base error for all Romance failures.
 *
 * Key design choice:
 * - "phase" is contextual metadata (decode/encode/parse/format/etc)
 * - "cause" preserves native or upstream errors
 */
export class RomanceError extends Error {
  public phase: string | undefined;
  public context?: unknown;
  public meta: Record<string, unknown>;

  constructor (message: string, config: RomanceErrorConfig = {}) {
    const {
      cause,
      phase,
      context,
      ...meta
    } = config;

    super(message, { cause });

    this.phase = phase;
    this.context = context;
    this.meta = meta;

    Error.captureStackTrace?.(this, this.constructor);
  }

  override toString(): string {
    let str = `[${this.name}] ${this.message}`;
    if (this.phase) str += ` (phase: ${this.phase})`;
    return str;
  }
}

/**
 * 1. Schema definition / compilation errors
 * - invalid type graphs
 * - malformed schema nodes
 * - illegal fork/list/bitmask definitions
 */
export class RomanceSchemaError extends RomanceError {}

/**
 * 2. Type system violations at runtime
 * - enum mismatch
 * - struct shape mismatch
 * - invalid codec output/input
 */
export class RomanceTypeError extends RomanceError {}

/**
 * 3. Decode (ROM → IR) failures
 * - unexpected opcode
 * - pointer corruption
 * - out-of-bounds reads
 * - desync in binary stream
 */
export class RomanceDecodeError extends RomanceError {}

/**
 * 4. Encode (IR → ROM) failures
 * - pointer exhaustion
 * - allocation failure
 * - invalid IR state for serialization
 */
export class RomanceEncodeError extends RomanceError {}

/**
 * 5. API / cross-node interaction violations
 * - illegal lib() usage
 * - invalid fetch/transform context
 * - schema node misuse of Api
 */
export class RomanceApiError extends RomanceError {}

/**
 * 6. Execution state / VM layer failures
 * - Rom stack corruption
 * - invalid address mapping
 * - broken jsr/rts invariants
 */
export class RomanceStateError extends RomanceError {}

/**
 * 7. Validation failures (optional strict mode)
 * - roundtrip mismatch
 * - hook validation failure
 * - deterministic mismatch detection
 */
export class RomanceValidationError extends RomanceError {}

/**
 * 8. Internal invariants violated
 * - impossible states
 * - corrupted WeakMap caches
 * - logic errors in engine assumptions
 *
 * This is your "this should never happen" class.
 */
export class RomanceInternalError extends RomanceError {}
