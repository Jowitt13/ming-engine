import { EngineError, parseBirthInput } from '@loom/contracts';
import { z } from 'zod';
import { projectBaziCareerJourney } from './bazi-career-journey.ts';

/**
 * IQ-4F explicit host-facing runtime entry for the single-system BaZi career
 * journey. The command name itself is the system selection: this entry only
 * ever serves `system: 'bazi'` and only emits the two frozen versioned
 * records (clarification-plan/v1 + response-view/v1) — never claim prose, so
 * no unadmitted rule vocabulary (格局, 喜用神, 身强弱, 化气, 行业匹配) can
 * reach a host. Every refusal goes through the existing clarification /
 * degrade / fail-closed chain.
 */
const BaziCareerRuntimeInput = z
  .strictObject({
    birthInput: z.unknown(),
    system: z.enum(['bazi']),
    depth: z.enum(['brief', 'standard', 'detailed']),
  })
  .strict();

export function runBaziCareerRuntime(
  rawInput: unknown,
  options: { now?: number } = {},
): { clarificationPlan: unknown; responseView: unknown } {
  const parsed = BaziCareerRuntimeInput.safeParse(rawInput);
  if (!parsed.success) {
    const missingSystem = !isRecord(rawInput) || rawInput.system === undefined;
    if (missingSystem) {
      throw new EngineError(
        'INPUT_VALIDATION_FAILED',
        'The bazi-career entry requires an explicit --system bazi selection.',
      );
    }
    throw new EngineError(
      isRecord(rawInput) && rawInput.system !== 'bazi'
        ? 'RULESET_UNSUPPORTED'
        : 'INPUT_VALIDATION_FAILED',
      isRecord(rawInput) && rawInput.system !== 'bazi'
        ? 'The bazi-career entry serves the admitted bazi system only.'
        : 'The bazi-career entry requires depth brief|standard|detailed and a birth-input file.',
    );
  }
  const birthInput = parseBirthInput(parsed.data.birthInput);
  const clarificationRequired = (code: string): EngineError =>
    new EngineError(
      'CLARIFICATION_REQUIRED',
      'No career answer was delivered. The request is missing a material setting or the affected claim class is unavailable; resolve it and retry.',
      { code },
    );
  try {
    const { clarificationPlan, responseView } = projectBaziCareerJourney(
      {
        birthInput,
        planningInput: {
          topic: 'career',
          requestedDepth: parsed.data.depth,
          systemScope: 'bazi',
          timeSensitiveClaims: true,
          // The engine-observed time accuracy decides reliability; the host
          // can only mirror it through the explicit request.
          birthTimeReliability: birthInput.timeAccuracy === 'unknown' ? 'unavailable' : 'confirmed',
          timingRequest: false,
          targetPeriod: 'not-required',
          rulesetVariantSensitiveClaims: false,
          rulesetVariant: 'not-required',
        },
      },
      { now: options.now ?? Date.now() },
    );
    return { clarificationPlan, responseView };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      // CLARIFICATION_REQUIRED, NO_ELIGIBLE_APPROVED_CLAIMS (degraded to an
      // empty claim class), and every other journey refusal withhold delivery
      // instead of inventing an answer.
      throw clarificationRequired(code);
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
