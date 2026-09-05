import {
  NarrativeTrace,
  type NarrativeTrace as NarrativeTraceValue,
} from '../../contracts/src/answer-claim.ts';
// validate-answer contract and validator live in contracts + interpret respectively.
import { ReadingDraft } from '../../contracts/src/validate-answer.ts';
import {
  type AnswerValidationResult,
  type AnswerViolation,
} from '../../contracts/src/validate-answer.ts';
import { validateAnswer } from '../../interpret/src/validate-answer.ts';
import { runBaziCareerJourney } from './bazi-career-journey.ts';
import { verifyBaziCareerNarrative } from './bazi-career-narrative.ts';

/**
 * IQ-4D internal answer verification for the bazi career journey. A visible
 * career answer artifact (reading-draft/v2) is validated against a scoped
 * context derived deterministically from the journey's own plan and view —
 * only the delivered single-system claims may ground it — and bound to the
 * IQ-4C narrative traces so every visible conclusion is trace-backed. It
 * reuses the existing IQ-2 validator; it adds no scoring, no quality
 * percentage, no model reviewer, and no semantic-faithfulness judgment.
 */
export type BaziCareerAnswerIssueCode =
  | 'TRACE_LINKAGE'
  | 'CLAIM_COVERAGE'
  | 'CAVEAT_COVERAGE'
  | 'DELIVERY_SURFACE'
  | 'ANSWER_TEXT_BOUNDARY'
  | 'UNSUPPORTED_PARAGRAPH';

export interface BaziCareerAnswerIssue {
  code: BaziCareerAnswerIssueCode;
  path: string;
}

export interface BaziCareerAnswerVerificationResult {
  ok: boolean;
  issues: readonly BaziCareerAnswerIssue[];
  violations: readonly AnswerViolation[];
}

export function verifyBaziCareerAnswer(
  rawAnswer: unknown,
  rawTraces: readonly unknown[],
  rawJourneyInput: unknown,
  options: { now: number },
): BaziCareerAnswerVerificationResult {
  // Degraded or blocked journeys (unknown birth time, unavailable rule
  // profile, unresolved material setting) never reach a view, so no valid
  // complete answer exists for them: the fail-closed throws propagate.
  const journey = runBaziCareerJourney(rawJourneyInput, options);
  const issues: BaziCareerAnswerIssue[] = [];

  const narrative = verifyBaziCareerNarrative(rawTraces, rawJourneyInput, options);
  issues.push(...narrative.issues);

  const parsedTraces: NarrativeTraceValue[] = [];
  for (const [index, rawTrace] of rawTraces.entries()) {
    const parsed = NarrativeTrace.safeParse(rawTrace);
    if (parsed.success) parsedTraces.push(parsed.data);
    else issues.push({ code: 'TRACE_LINKAGE', path: `$.traces[${index}]` });
  }

  const draft = ReadingDraft.safeParse(rawAnswer);
  if (!draft.success) {
    issues.push({ code: 'ANSWER_TEXT_BOUNDARY', path: '$.readingDraft' });
    return { ok: false, issues, violations: [] };
  }

  // Scoped validation context, derived from the journey itself: only the
  // facts behind the delivered view claims may ground the answer, with the
  // matching caveats; time-profile warnings qualify every chart-derived
  // claim and stay required.
  const scopedClaimIds = new Set(journey.responseView.approvedClaimIds);
  const scopedFacts = journey.answerPlan.selectedFacts.filter((fact) =>
    scopedClaimIds.has(`approved-claim:${fact.id}`),
  );
  const scopedCaveats = [
    ...new Set(
      scopedFacts
        .map((fact) => fact.caveat)
        .filter((caveat): caveat is string => caveat !== undefined),
    ),
  ];
  const validation: AnswerValidationResult = validateAnswer({
    answerPlan: {
      allowedFactIds: scopedFacts.map((fact) => fact.id),
      requiredCaveats: scopedCaveats,
      requiredWarningCodes: journey.answerPlan.requiredWarningCodes,
      guardrails: journey.answerPlan.guardrails,
      answerability: journey.answerPlan.answerability,
      request: journey.answerPlan.request,
      disclaimers: journey.answerPlan.disclaimers,
    },
    readingDraft: draft.data,
  });
  if (!validation.ok) {
    issues.push({ code: 'ANSWER_TEXT_BOUNDARY', path: '$.readingDraft' });
  }

  // Every content paragraph must be trace-backed: a trace exists whose
  // visible text is exactly this paragraph's text and whose fact refs cover
  // the paragraph's citations. Constraint-only paragraphs (no fact ids) are
  // exempt; their references already resolve through the validator.
  for (const [sectionIndex, section] of draft.data.sections.entries()) {
    for (const [paragraphIndex, paragraph] of section.paragraphs.entries()) {
      if (paragraph.sourceFactIds.length === 0) continue;
      const factRefs = [...new Set(paragraph.sourceFactIds)];
      const supported = parsedTraces.some(
        (trace) =>
          trace.visibleText === paragraph.text &&
          factRefs.every((factId) => trace.factRefs.includes(factId)),
      );
      if (!supported) {
        issues.push({
          code: 'UNSUPPORTED_PARAGRAPH',
          path: `$.readingDraft.sections[${sectionIndex}].paragraphs[${paragraphIndex}]`,
        });
      }
    }
  }

  return { ok: issues.length === 0, issues, violations: validation.violations };
}
