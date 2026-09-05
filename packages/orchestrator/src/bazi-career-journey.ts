import { parseBirthInput } from '@loom/contracts';
import { ClarificationPlanningInput } from '../../contracts/src/clarification-plan.ts';
import { z } from 'zod';
import { planClarificationMateriality } from '../../interpret/src/clarification-materiality.ts';
import {
  approveAnswerClaimCandidates,
  projectAnswerClaimCandidates,
} from '../../interpret/src/answer-claim-chain.ts';
import { buildClarifiedResponseView } from './clarified-response.ts';
import { runAnswerPlan } from './interpret.ts';

/**
 * IQ-4A internal career journey for the owner-selected single system (bazi).
 * It composes only already-admitted pieces: the frozen `bazi-standard@0.1.0` /
 * `bazi-rules-ziping@0.1.0` rulesets through `runAnswerPlan`, the IQ-1 claim
 * chain, and the IQ-3D clarified-response surface. It adds no rule, no
 * contract version, no narration, no runtime entry, and no cross-system
 * synthesis. Reasoning 2.0 (D1/D2 shadow and opt-in) evidence never reaches
 * this path.
 */
export type BaziCareerJourneyErrorCode =
  | 'TOPIC_SCOPE'
  | 'SETTING_CONFLICT'
  | 'CLARIFICATION_REQUIRED'
  | 'APPROVAL_BLOCKED'
  | 'NO_ELIGIBLE_CLAIMS';

export class BaziCareerJourneyError extends Error {
  constructor(readonly code: BaziCareerJourneyErrorCode) {
    super(code);
    this.name = 'BaziCareerJourneyError';
  }
}

const BaziCareerJourneyInput = z.strictObject({
  // Parsed through the bounded facade below: a caller may pass an already
  // normalized BirthInput and the engine's own parsing stays canonical.
  birthInput: z.unknown(),
  planningInput: ClarificationPlanningInput,
});

export type BaziCareerJourneyInput = z.infer<typeof BaziCareerJourneyInput>;

/**
 * Projects one transient bazi career journey: clarification plan plus the
 * single-system response view. Every material setting must be explicitly
 * resolved; the host cannot assert a birth-time reliability that contradicts
 * the birth input; with unknown birth time the chart-derived claims are
 * omitted and delivery fails closed instead of guessing.
 */
export function projectBaziCareerJourney(
  rawInput: unknown,
  options: { now: number },
): {
  clarificationPlan: ReturnType<typeof planClarificationMateriality>;
  responseView: ReturnType<typeof buildClarifiedResponseView>;
} {
  const { clarificationPlan, responseView } = runBaziCareerJourney(rawInput, options);
  return { clarificationPlan, responseView };
}

/**
 * Internal IQ-4C runner: the full journey including the approved
 * single-system claims, so the narrative verifier can bind traces to exactly
 * the claims the view delivers. Same fail-closed behavior as the projection.
 */
export function runBaziCareerJourney(
  rawInput: unknown,
  options: { now: number },
): {
  clarificationPlan: ReturnType<typeof planClarificationMateriality>;
  responseView: ReturnType<typeof buildClarifiedResponseView>;
  baziClaims: ReturnType<typeof approveAnswerClaimCandidates>['approvedClaims'];
} {
  const input = BaziCareerJourneyInput.parse(rawInput);
  const birthInput = parseBirthInput(input.birthInput);
  if (input.planningInput.topic !== 'career' || input.planningInput.systemScope !== 'bazi') {
    throw new BaziCareerJourneyError('TOPIC_SCOPE');
  }
  // The engine-observed time accuracy decides reliability; the host can only
  // mirror it. Unknown time keeps the matching claim class material.
  const observedReliability = birthInput.timeAccuracy === 'unknown' ? 'unavailable' : 'confirmed';
  if (
    input.planningInput.timeSensitiveClaims !== true ||
    input.planningInput.birthTimeReliability !== observedReliability
  ) {
    throw new BaziCareerJourneyError('SETTING_CONFLICT');
  }
  const clarificationPlan = planClarificationMateriality(input.planningInput);
  if (clarificationPlan.status === 'requires-clarification') {
    throw new BaziCareerJourneyError('CLARIFICATION_REQUIRED');
  }

  const { publicResult, answerPlan } = runAnswerPlan(birthInput, {
    now: options.now,
    topic: 'career',
  });
  const context = { publicResult, answerPlan };
  const approval = approveAnswerClaimCandidates(
    context,
    projectAnswerClaimCandidates(context).candidates,
  );
  if (approval.issues.length > 0 || approval.approvedClaims.length === 0) {
    throw new BaziCareerJourneyError('APPROVAL_BLOCKED');
  }

  // Single-system selection: only admitted bazi-namespace claims may continue.
  const baziClaims = approval.approvedClaims.filter((claim) => claim.system === 'bazi');
  if (baziClaims.length === 0) {
    throw new BaziCareerJourneyError('NO_ELIGIBLE_CLAIMS');
  }

  // Unknown birth time makes every chart-derived bazi claim hour-affected
  // (the hour pillar is absent from pillars, roots, and officer enumeration),
  // so the whole class is omitted through the recorded degradation instead of
  // being delivered as if complete. Rule-derived claims additionally carry the
  // ruleset-variant sensitivity: the admitted `bazi-rules-ziping` line is one
  // rule profile, so an unresolved rule-profile choice blocks exactly those
  // claims instead of silently standing in a default.
  const timeSensitivities = publicResult.inputReliability.birthTimeKnown
    ? []
    : (['time-sensitive'] as const);
  const responseView = buildClarifiedResponseView({
    planningInput: input.planningInput,
    approvedClaims: baziClaims,
    claimEligibility: baziClaims.map((claim) => ({
      claimId: claim.claimId,
      sensitivities: [
        ...timeSensitivities,
        ...(claim.mechanismRefs.some((ref) => ref.startsWith('bazi-rule/'))
          ? (['ruleset-variant-sensitive'] as const)
          : []),
      ],
    })),
  });
  return { clarificationPlan, responseView, baziClaims };
}
