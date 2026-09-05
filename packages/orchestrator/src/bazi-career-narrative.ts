import { NarrativeTrace } from '../../contracts/src/answer-claim.ts';
import { verifyNarrativeTrace } from '../../interpret/src/answer-claim-chain.ts';
import { lintReading } from '../../interpret/src/reading-lint.ts';
import { runBaziCareerJourney } from './bazi-career-journey.ts';

/**
 * IQ-4C internal verifier for synthetic bazi career narrative examples. It
 * binds each hand-authored paragraph trace to exactly the approved
 * single-system claims of one ready journey, requires every delivered claim
 * and every claim-bound material caveat to stay traceable, and applies the
 * deterministic delivery-surface lint to the visible text. It never judges
 * whether the wording is semantically faithful, natural, or useful — that
 * remains IQ-2 and the optional quality-evidence track.
 */
export type BaziCareerNarrativeIssueCode =
  'TRACE_LINKAGE' | 'CLAIM_COVERAGE' | 'CAVEAT_COVERAGE' | 'DELIVERY_SURFACE';

export interface BaziCareerNarrativeIssue {
  code: BaziCareerNarrativeIssueCode;
  path: string;
}

export interface BaziCareerNarrativeVerificationResult {
  ok: boolean;
  issues: readonly BaziCareerNarrativeIssue[];
}

export function verifyBaziCareerNarrative(
  rawTraces: readonly unknown[],
  rawJourneyInput: unknown,
  options: { now: number },
): BaziCareerNarrativeVerificationResult {
  // Degraded or blocked journeys never reach a view, so no complete-looking
  // narrative can be verified against them: the runner's fail-closed throws
  // propagate unchanged.
  const { responseView, baziClaims } = runBaziCareerJourney(rawJourneyInput, options);
  const issues: BaziCareerNarrativeIssue[] = [];

  const parsedTraces: NarrativeTrace[] = [];
  for (const [index, rawTrace] of rawTraces.entries()) {
    const linkage = verifyNarrativeTrace(rawTrace, baziClaims);
    if (!linkage.ok) {
      issues.push({ code: 'TRACE_LINKAGE', path: `$.traces[${index}]` });
      continue;
    }
    parsedTraces.push(NarrativeTrace.parse(rawTrace));
  }

  const tracedClaimIds = new Set(parsedTraces.flatMap((trace) => trace.approvedClaimIds));
  const deliveredClaimIds = new Set(responseView.approvedClaimIds);
  if (
    tracedClaimIds.size !== deliveredClaimIds.size ||
    [...deliveredClaimIds].some((claimId) => !tracedClaimIds.has(claimId))
  ) {
    issues.push({ code: 'CLAIM_COVERAGE', path: '$.traces.approvedClaimIds' });
  }

  for (const caveatId of responseView.materialCaveatIds) {
    if (!caveatId.startsWith('claim-constraint:')) continue;
    const parts = caveatId.split(':');
    const claimId = `${parts[1]}:${parts[2]}`;
    const kind = parts[3] ?? '';
    const index = Number(parts[4]);
    const covered = parsedTraces.some(
      (trace) =>
        trace.approvedClaimIds.includes(claimId) &&
        trace.constraintRefs.some((ref) => ref.kind === kind && ref.index === index),
    );
    if (!covered) issues.push({ code: 'CAVEAT_COVERAGE', path: `$.traces.${caveatId}` });
  }

  for (const [index, trace] of parsedTraces.entries()) {
    const lint = lintReading(trace.visibleText, { channel: 'topic' });
    if (!lint.ok || lint.violations.some((violation) => violation.severity === 'error')) {
      issues.push({ code: 'DELIVERY_SURFACE', path: `$.traces[${index}].visibleText` });
    }
  }

  return { ok: issues.length === 0, issues };
}
