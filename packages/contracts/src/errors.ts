import { z } from 'zod';

/**
 * Distinct, stable error codes (handoff §6). Callers must be able to tell input
 * validation apart from ambiguity, missing coordinates, out-of-range dates,
 * provider failures, etc. — never collapse everything into a generic 500.
 */
export const ERROR_CODES = {
  INPUT_VALIDATION_FAILED: 'INPUT_VALIDATION_FAILED',
  AMBIGUOUS_LOCAL_TIME: 'AMBIGUOUS_LOCAL_TIME',
  NONEXISTENT_LOCAL_TIME: 'NONEXISTENT_LOCAL_TIME',
  DATE_OUT_OF_RANGE: 'DATE_OUT_OF_RANGE',
  MISSING_COORDINATES: 'MISSING_COORDINATES',
  UNKNOWN_TIMEZONE: 'UNKNOWN_TIMEZONE',
  HOUSE_SYSTEM_UNAVAILABLE: 'HOUSE_SYSTEM_UNAVAILABLE',
  PROVIDER_FAILED: 'PROVIDER_FAILED',
  RULESET_UNSUPPORTED: 'RULESET_UNSUPPORTED',
  LUNAR_CONVERSION_UNAVAILABLE: 'LUNAR_CONVERSION_UNAVAILABLE',
  CLARIFICATION_REQUIRED: 'CLARIFICATION_REQUIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Stable process exit codes so a host can branch on failure type from the shell. */
export const ERROR_EXIT_CODES: Record<ErrorCode, number> = {
  INTERNAL_ERROR: 1,
  INPUT_VALIDATION_FAILED: 2,
  AMBIGUOUS_LOCAL_TIME: 3,
  NONEXISTENT_LOCAL_TIME: 4,
  DATE_OUT_OF_RANGE: 5,
  MISSING_COORDINATES: 6,
  UNKNOWN_TIMEZONE: 7,
  HOUSE_SYSTEM_UNAVAILABLE: 8,
  PROVIDER_FAILED: 9,
  RULESET_UNSUPPORTED: 10,
  LUNAR_CONVERSION_UNAVAILABLE: 11,
  CLARIFICATION_REQUIRED: 12,
};

/** Serialized error envelope written to stdout when the CLI fails. */
export const EngineErrorEnvelope = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum(Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]),
    message: z.string(),
    detail: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type EngineErrorEnvelope = z.infer<typeof EngineErrorEnvelope>;

/** Typed, catchable engine error carrying a stable code and structured detail. */
export class EngineError extends Error {
  readonly code: ErrorCode;
  readonly detail: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.detail = detail;
  }

  get exitCode(): number {
    return ERROR_EXIT_CODES[this.code];
  }

  toEnvelope(): EngineErrorEnvelope {
    const error: EngineErrorEnvelope['error'] = { code: this.code, message: this.message };
    if (this.detail !== undefined) error.detail = this.detail;
    return { ok: false, error };
  }
}

/** Wrap any thrown value into an EngineError without losing the original message. */
export function toEngineError(err: unknown): EngineError {
  if (err instanceof EngineError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new EngineError(ERROR_CODES.INTERNAL_ERROR, message);
}
