// Synthetic fixtures only - fictional data; not a real person. fixtureKind: synthetic-technical.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, parseBirthInput, type BirthInput } from '@loom/contracts';
import { describe, expect, it } from 'vitest';
import { ClarificationPlanningInput } from '../../contracts/src/clarification-plan.ts';
import { planClarificationMateriality } from '../../interpret/src/clarification-materiality.ts';
import { ResponseViewPlanningError } from '../../interpret/src/response-view.ts';
import { BaziCareerJourneyError, projectBaziCareerJourney } from '../src/bazi-career-journey.ts';
import { runAnswerPlan } from '../src/interpret.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

const FIXED = Date.parse('2026-01-01T00:00:00Z');

const syntheticInput = parseBirthInput({
  calendar: 'gregorian',
  localDate: '1991-02-03',
  localTime: '04:05:06',
  timeAccuracy: 'exact',
  timezone: 'Pacific/Port_Moresby',
  location: {
    latitude: 12.345678,
    longitude: 98.765432,
    source: 'user',
    displayName: 'Synthetic bazi-career journey location sentinel',
  },
  ruleGender: 'female',
  settings: { systems: ['bazi'] },
});

const unknownTimeInput: BirthInput = parseBirthInput({
  ...syntheticInput,
  localTime: undefined,
  timeAccuracy: 'unknown',
});

const approximateTimeInput: BirthInput = parseBirthInput({
  ...syntheticInput,
  timeAccuracy: 'approximate',
});

function planningInput(
  overrides: Partial<{
    topic: 'career' | 'wealth' | null;
    requestedDepth: 'brief' | 'standard' | 'detailed' | null;
    systemScope: 'bazi' | 'western' | null;
    birthTimeReliability: 'confirmed' | 'unavailable' | 'unresolved';
    timeSensitiveClaims: boolean;
  }> = {},
) {
  return ClarificationPlanningInput.parse({
    topic: 'career',
    requestedDepth: 'standard',
    systemScope: 'bazi',
    timeSensitiveClaims: true,
    birthTimeReliability: 'confirmed',
    timingRequest: false,
    targetPeriod: 'not-required',
    rulesetVariantSensitiveClaims: false,
    rulesetVariant: 'not-required',
    ...overrides,
  });
}

function journeyInput(
  birthInput: BirthInput,
  planningOverrides: Parameters<typeof planningInput>[0] = {},
) {
  return { birthInput, planningInput: planningInput(planningOverrides) };
}

function expectJourneyError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error('expected the bazi career journey to fail closed');
  } catch (error) {
    expect(error).toBeInstanceOf(BaziCareerJourneyError);
    expect((error as BaziCareerJourneyError).code).toBe(code);
  }
}

describe('IQ-4A internal bazi career journey', () => {
  it(
    'projects one exact-time clarified journey with only admitted bazi career claims',
    { timeout: 30_000 },
    () => {
      const { clarificationPlan, responseView } = projectBaziCareerJourney(
        journeyInput(syntheticInput),
        { now: FIXED },
      );
      expect(clarificationPlan.status).toBe('ready');
      expect(clarificationPlan.degradationCodes).toEqual([]);
      expect(responseView).toEqual({
        contractVersion: 'response-view/v1',
        clarificationStatus: 'ready',
        topic: 'career',
        requestedDepth: 'standard',
        system: 'bazi',
        approvedClaimIds: ['approved-claim:fact-7', 'approved-claim:fact-96'],
        materialCaveatIds: [
          'claim-constraint:approved-claim:fact-7:caveat:0',
          'claim-constraint:approved-claim:fact-96:caveat:3',
        ],
        allowedContentCategories: [
          'conclusion',
          'mechanism-and-implication',
          'material-caveat',
          'practical-options',
        ],
        auditAvailability: 'explicit-request-only',
        transient: true,
        regenerable: true,
      });
    },
  );

  it('feeds only from the admitted frozen bazi rulesets and never a Reasoning 2.0 line', () => {
    const { publicResult } = runAnswerPlan(syntheticInput, { now: FIXED, topic: 'career' });
    expect(publicResult.rulesets.some((ruleset) => ruleset.id === 'bazi-standard')).toBe(true);
    for (const ruleset of publicResult.rulesets) {
      expect(ruleset.id).not.toContain('@0.2.0');
    }
  });

  it('enforces the single-system career scope before any calculation', () => {
    expectJourneyError(
      () =>
        projectBaziCareerJourney(journeyInput(syntheticInput, { topic: 'wealth' }), { now: FIXED }),
      'TOPIC_SCOPE',
    );
    expectJourneyError(
      () =>
        projectBaziCareerJourney(journeyInput(syntheticInput, { systemScope: 'western' }), {
          now: FIXED,
        }),
      'TOPIC_SCOPE',
    );
    expectJourneyError(
      () => projectBaziCareerJourney(journeyInput(syntheticInput, { topic: null }), { now: FIXED }),
      'TOPIC_SCOPE',
    );
  });

  it('rejects a host-asserted reliability that contradicts the birth input', () => {
    expectJourneyError(
      () => projectBaziCareerJourney(journeyInput(unknownTimeInput), { now: FIXED }),
      'SETTING_CONFLICT',
    );
  });

  it('fails closed on an unanswered material setting', () => {
    expectJourneyError(
      () =>
        projectBaziCareerJourney(journeyInput(syntheticInput, { requestedDepth: null }), {
          now: FIXED,
        }),
      'CLARIFICATION_REQUIRED',
    );
  });

  it(
    'keeps approximate time deliverable while exact material caveats stay in the view',
    { timeout: 30_000 },
    () => {
      const { clarificationPlan, responseView } = projectBaziCareerJourney(
        journeyInput(approximateTimeInput),
        { now: FIXED },
      );
      expect(clarificationPlan.status).toBe('ready');
      expect(responseView.clarificationStatus).toBe('ready');
      expect(responseView.system).toBe('bazi');
      expect(responseView.approvedClaimIds.length).toBeGreaterThan(0);
      expect(
        responseView.materialCaveatIds.every((caveatId) =>
          caveatId.startsWith('claim-constraint:approved-claim:fact-'),
        ),
      ).toBe(true);
      expect(responseView.materialCaveatIds).toContain(
        'claim-constraint:approved-claim:fact-7:caveat:0',
      );
    },
  );

  it(
    'omits the whole chart-derived claim class under unknown birth time and refuses delivery',
    { timeout: 30_000 },
    () => {
      let caught: unknown;
      try {
        projectBaziCareerJourney(
          journeyInput(unknownTimeInput, { birthTimeReliability: 'unavailable' }),
          { now: FIXED },
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ResponseViewPlanningError);
      expect((caught as ResponseViewPlanningError).code).toBe('NO_ELIGIBLE_APPROVED_CLAIMS');
      // The degradation itself stays honest and bounded: the clarification
      // contract records the omitted claim class for exactly this input shape.
      const degradedPlan = planClarificationMateriality(
        planningInput({ birthTimeReliability: 'unavailable' }),
      );
      expect(degradedPlan.status).toBe('degraded');
      expect(degradedPlan.degradationCodes).toEqual(['omit-time-sensitive-claims']);
    },
  );

  it('is deterministic for a fixed clock', { timeout: 30_000 }, () => {
    expect(
      canonicalJson(projectBaziCareerJourney(journeyInput(syntheticInput), { now: FIXED })),
    ).toBe(canonicalJson(projectBaziCareerJourney(journeyInput(syntheticInput), { now: FIXED })));
  });

  it('rejects surface input drift through strict bounded shapes', () => {
    expect(() =>
      projectBaziCareerJourney(
        { ...journeyInput(syntheticInput), rawUserQuestion: '帮我看事业' },
        { now: FIXED },
      ),
    ).toThrow();
    expect(() =>
      projectBaziCareerJourney(
        {
          birthInput: { ...syntheticInput, calendar: 'nonsense' },
          planningInput: planningInput(),
        },
        { now: FIXED },
      ),
    ).toThrow();
  });

  it('keeps the journey module offline, transient, and persistence-free', () => {
    const module = read('packages/orchestrator/src/bazi-career-journey.ts');
    for (const forbidden of [
      'fetch(',
      'child_process',
      'openai',
      'writeFile',
      'rawUserQuestion:',
      'confidence:',
      'score:',
      'answer-plan/v2',
    ]) {
      expect(module, forbidden).not.toContain(forbidden);
    }
  });

  it('wires exactly one package surface and keeps every runtime entry isolated', () => {
    expect(read('packages/orchestrator/src/index.ts')).toContain('./bazi-career-journey.ts');
    for (const relative of [
      'packages/orchestrator/src/engine-entry.ts',
      'packages/orchestrator/src/interpret.ts',
      'packages/contracts/src/index.ts',
      'packages/interpret/src/index.ts',
      'packages/contracts/src/answer-plan.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'skills/xuan-ji-yu-heng/SKILL.md',
      'package.json',
    ]) {
      expect(read(relative), relative).not.toContain('bazi-career-journey');
    }
  });
});
