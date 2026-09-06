/**
 * esbuild entry for the packaged engine (skills/.../scripts/dist/engine.mjs).
 *
 * The CLI imports ONLY from the built bundle, so everything it needs — engine
 * verbs plus the handful of contract helpers — is re-exported here and bundled
 * into a single self-contained ESM file with no external path dependencies.
 */
export { doctor } from './doctor.ts';
export type { DoctorReport, RuntimeInfo } from './doctor.ts';

export { calculate, runNormalize, runHoroscope, computeRequestId } from './calculate.ts';
export type { CalculateOptions, NormalizeResult, HoroscopeOptions } from './calculate.ts';

export { runAnswerPlan, runInterpret } from './interpret.ts';
export type { AnswerPlanOptions, InterpretOptions } from './interpret.ts';

// IQ-4F explicit single-system (bazi) career runtime entry. Serves only the
// frozen versioned records; the generic answer-plan verb above stays the
// unspecified-system default.
export { runBaziCareerRuntime } from './bazi-career-runtime.ts';

// Output-layer term firewall for produced Channel B reports (ADR 0011). Pure text util.
export { lintReading, READING_TERMS, JARGON_STRONG, JARGON_SOFT } from '@loom/interpret';
export type {
  ReadingLintResult,
  ReadingViolation,
  ReadingLintOptions,
  ReadingChannel,
} from '@loom/interpret';

// Fact-boundary and safety validator for host-produced answer drafts (P0),
// plus the bounded parsing facade shared by the CLI and host integrations.
export { validateAnswer, parseValidateAnswerInputBounded } from '@loom/interpret';

// Validator types come from the contracts layer.
export type {
  AnswerValidationResult,
  AnswerViolation as AnswerValidationViolation,
} from '@loom/contracts';

export { runSynastry } from './synastry.ts';
export type { SynastryRunOptions } from './synastry.ts';

export { timeIndexFromHour } from '@loom/ziwei';

export { compareProfiles, listCompareProfiles, COMPARE_PROFILES } from './compare.ts';
export type { CompareResult, CompareEntry } from './compare.ts';

export {
  renderReport,
  renderSvgReport,
  renderHoroscopeReport,
  renderHoroscopeSvg,
  escapeHtml,
} from './render.ts';
export type { RenderOptions } from './render.ts';

export { verify } from './verify.ts';
export type { VerifyReport, VerifyCheck } from './verify.ts';

// Contract helpers the CLI needs — re-exported so the CLI imports one bundle only.
// The validate-answer MAX_* limits and version constants are part of the public
// runtime surface documented in references/answer-contract.md.
export {
  parseBirthInput,
  parseSynastryInput,
  ValidateAnswerInput,
  MAX_VALIDATE_ANSWER_INPUT_BYTES,
  MAX_OBJECT_KEYS,
  MAX_OBJECT_KEY_CHARS,
  MAX_PARAGRAPH_TEXT_CHARS,
  MAX_SECTIONS,
  MAX_PARAGRAPHS_PER_SECTION,
  MAX_SOURCE_FACT_IDS_PER_PARAGRAPH,
  MAX_CONSTRAINT_REFS_PER_PARAGRAPH,
  MAX_TOTAL_SOURCE_FACT_IDS,
  MAX_FACT_ID_CHARS,
  MAX_CAVEATS_EXPRESSED,
  MAX_CAVEAT_ENTRY_CHARS,
  MAX_WARNINGS_DISCLOSED,
  MAX_WARNING_ENTRY_CHARS,
  MAX_SECTION_ID_CHARS,
  MAX_HEADING_CHARS,
  MAX_TOTAL_TEXT_CHARS,
  MAX_ALLOWED_FACT_IDS,
  MAX_REQUIRED_CAVEATS,
  MAX_REQUIRED_WARNING_CODES,
  MAX_PLAN_DISCLAIMERS,
  MAX_DISCLAIMER_ENTRY_CHARS,
  MAX_PLAN_GUARDRAILS,
  MAX_NOT_SUPPORTED_TEXT_CHARS,
  MAX_VIOLATIONS,
  READING_DRAFT_CONTRACT_VERSION,
  READING_DRAFT_LEGACY_V1,
  VALIDATION_RESULT_CONTRACT_VERSION,
  EngineError,
  toEngineError,
  ERROR_CODES,
  canonicalJson,
  canonicalJsonPretty,
  ENGINE_NAME,
  ENGINE_VERSION,
  SCHEMA_VERSION,
} from '@loom/contracts';
export type {
  BirthInput,
  ChartBundle,
  NormalizedBirthData,
  SynastryInput,
  SynastryResult,
  ValidateAnswerInput as ValidateAnswerInputType,
} from '@loom/contracts';
