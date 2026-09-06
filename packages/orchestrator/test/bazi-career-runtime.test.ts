// Synthetic fixtures only - fictional data; not a real person. fixtureKind: synthetic-technical.
import { canonicalJson, EngineError, parseBirthInput, type BirthInput } from '@loom/contracts';
import { describe, expect, it } from 'vitest';
import { runBaziCareerRuntime } from '../src/bazi-career-runtime.ts';
import { runBaziCareerRuntime as entryExport } from '../src/engine-entry.ts';
import { runAnswerPlan } from '../src/interpret.ts';

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
    displayName: 'Synthetic bazi-career runtime location sentinel',
  },
  ruleGender: 'female',
  settings: { systems: ['bazi'] },
});

const unknownTimeInput: BirthInput = parseBirthInput({
  ...syntheticInput,
  localTime: undefined,
  timeAccuracy: 'unknown',
});

function expectEngineError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error('expected the bazi-career runtime entry to fail closed');
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe(code);
  }
}

describe('IQ-4F explicit bazi-career runtime entry', () => {
  it('serves an exact-time request with the two frozen versioned records only', () => {
    const output = runBaziCareerRuntime(
      { birthInput: syntheticInput, system: 'bazi', depth: 'standard' },
      { now: FIXED },
    );
    const serialized = canonicalJson(output);
    expect(output.clarificationPlan).toMatchObject({ status: 'ready', transient: true });
    expect(output.responseView).toMatchObject({
      contractVersion: 'response-view/v1',
      topic: 'career',
      system: 'bazi',
      requestedDepth: 'standard',
      clarificationStatus: 'ready',
    });
    // Blocked-rule vocabulary and other-system names can never appear: the
    // entry emits records and ids, never claim text.
    for (const forbidden of [
      '格局',
      '喜用',
      '身强弱',
      '化气',
      '行业',
      '七杀',
      'western',
      'ziwei',
      'vedic',
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
  });

  it('keeps approximate time deliverable through the same explicit entry', () => {
    const approximateInput = parseBirthInput({ ...syntheticInput, timeAccuracy: 'approximate' });
    const output = runBaziCareerRuntime(
      { birthInput: approximateInput, system: 'bazi', depth: 'standard' },
      { now: FIXED },
    );
    expect(output.responseView).toMatchObject({
      clarificationStatus: 'ready',
      system: 'bazi',
    });
  });

  it('fails closed with CLARIFICATION_REQUIRED on unknown birth time', () => {
    expectEngineError(
      () =>
        runBaziCareerRuntime(
          { birthInput: unknownTimeInput, system: 'bazi', depth: 'standard' },
          { now: FIXED },
        ),
      'CLARIFICATION_REQUIRED',
    );
  });

  it('fails closed on a missing, non-bazi, or invalid explicit selection', () => {
    expectEngineError(
      () => runBaziCareerRuntime({ birthInput: syntheticInput, depth: 'standard' }, { now: FIXED }),
      'INPUT_VALIDATION_FAILED',
    );
    expectEngineError(
      () =>
        runBaziCareerRuntime(
          { birthInput: syntheticInput, system: 'western', depth: 'standard' },
          { now: FIXED },
        ),
      'RULESET_UNSUPPORTED',
    );
    expectEngineError(
      () =>
        runBaziCareerRuntime(
          { birthInput: syntheticInput, system: 'bazi', depth: 'auto' },
          { now: FIXED },
        ),
      'INPUT_VALIDATION_FAILED',
    );
  });

  it('is deterministic for a fixed clock', () => {
    const first = runBaziCareerRuntime(
      { birthInput: syntheticInput, system: 'bazi', depth: 'standard' },
      { now: FIXED },
    );
    const second = runBaziCareerRuntime(
      { birthInput: syntheticInput, system: 'bazi', depth: 'standard' },
      { now: FIXED },
    );
    expect(canonicalJson(first)).toBe(canonicalJson(second));
  });

  it('re-exports the same entry from the engine bundle surface', () => {
    expect(entryExport).toBe(runBaziCareerRuntime);
  });

  it('leaves the generic career path and its multi-system facts unchanged', () => {
    const { publicResult } = runAnswerPlan(syntheticInput, { now: FIXED, topic: 'career' });
    const systems = new Set(
      publicResult.facts.flatMap((fact) => fact.evidence.map((evidence) => evidence.kind)),
    );
    expect(systems.has('bazi')).toBe(true);
    expect(systems.has('western')).toBe(true);
    expect(systems.has('ziwei')).toBe(true);
    expect(systems.has('vedic')).toBe(true);
  });
});
