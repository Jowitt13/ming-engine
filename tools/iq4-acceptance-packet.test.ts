import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, canonicalJsonPretty } from '../packages/contracts/src/ids.ts';
import { describe, expect, it } from 'vitest';
import { HOSTS } from './lib/host-config.ts';
import { runBaziCareerJourney } from '../packages/orchestrator/src/bazi-career-journey.ts';
import {
  loadIq4AcceptancePacket,
  verifyIq4AcceptancePacket,
} from './eval/verify-iq4-acceptance-packet.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

const PACKET_PATH = 'evals/fixtures/synthetic/iq4-acceptance-packet.json';

function tampered(mutate: (packet: Record<string, unknown>) => void): unknown {
  const packet = JSON.parse(read(PACKET_PATH)) as Record<string, unknown>;
  mutate(packet);
  return packet;
}

const packetNow = () => (loadIq4AcceptancePacket() as Record<string, unknown>).fixedNow as number;
const packetJourneyInput = () =>
  (loadIq4AcceptancePacket() as Record<string, unknown>).journeyInput;

const INPUT_DIGEST = `sha256:${createHash('sha256')
  .update(canonicalJson((packetJourneyInput() as Record<string, unknown>).birthInput))
  .digest('hex')}`;

// The exact stdout digest the verifier derives from the recomputed journey.
const EXPECTED_STDOUT_DIGEST = (() => {
  const journey = runBaziCareerJourney(packetJourneyInput(), { now: packetNow() });
  return `sha256:${createHash('sha256')
    .update(
      `${canonicalJsonPretty({
        ok: true,
        clarificationPlan: journey.clarificationPlan,
        responseView: journey.responseView,
      })}\n`,
    )
    .digest('hex')}`;
})();

const RUNTIME_SOURCE_COMMIT = (
  (loadIq4AcceptancePacket() as Record<string, unknown>).runtimeEntry as Record<string, unknown>
).sourceCommit as string;

function executedResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    exitCode: 0,
    outputDigest: EXPECTED_STDOUT_DIGEST,
    executedAtISO: '2026-09-07',
    notes: 'host acceptance run',
    sourceCommit: RUNTIME_SOURCE_COMMIT,
    candidateSha256: 'sha256:' + 'a'.repeat(64),
    inputDigest: INPUT_DIGEST,
    ...overrides,
  };
}

describe('IQ-4G acceptance packet (bazi-career runtime binding)', () => {
  it('ships a fully linked synthetic packet whose verification is green', () => {
    const result = verifyIq4AcceptancePacket(loadIq4AcceptancePacket());
    expect(result.ok, JSON.stringify(result.checks.filter((check) => !check.ok))).toBe(true);
  });

  it('ships every host record and the owner review as explicitly pending', () => {
    const packet = loadIq4AcceptancePacket() as Record<string, unknown>;
    const hostAcceptance = packet.hostAcceptance as Record<string, unknown>;
    expect(hostAcceptance.status).toBe('NOT_EXECUTED');
    const records = hostAcceptance.records as Array<Record<string, unknown>>;
    expect(records.map((record) => record.hostId)).toEqual(HOSTS.map((host) => host.id));
    for (const record of records) {
      expect(record.status).toBe('NOT_EXECUTED');
    }
    const ownerReview = packet.ownerReview as Record<string, unknown>;
    expect(ownerReview.status).toBe('NOT_EXECUTED');
    expect(ownerReview.reviewRecord).toBeNull();
  });

  it('pins the IQ-4F explicit bazi-career entry, source commit, and input digest', () => {
    const packet = loadIq4AcceptancePacket() as Record<string, unknown>;
    const runtimeEntry = packet.runtimeEntry as Record<string, unknown>;
    expect(runtimeEntry.command).toContain('bazi-career');
    expect(runtimeEntry.command).toContain('--system bazi');
    expect(runtimeEntry.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(runtimeEntry.inputDigest).toBe(INPUT_DIGEST);
  });

  it('accepts a host record bound to the recomputed bazi-career stdout digest', () => {
    const packet = tampered((packet) => {
      const records = (packet.hostAcceptance as Record<string, unknown>).records as Array<
        Record<string, unknown>
      >;
      records[0]!.status = 'EXECUTED';
      records[0]!.result = executedResult();
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok, JSON.stringify(result.checks.filter((check) => !check.ok))).toBe(true);
  });

  it('fail-closes when a host record claims a status outside the vocabulary', () => {
    const packet = tampered((packet) => {
      const records = (packet.hostAcceptance as Record<string, unknown>).records as Array<
        Record<string, unknown>
      >;
      records[0]!.status = 'PASS';
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some(
        (check) =>
          check.name.startsWith('host record') && check.detail?.includes('pending is never pass'),
      ),
    ).toBe(true);
  });

  it('fail-closes on an EXECUTED host record without complete evidence', () => {
    const packet = tampered((packet) => {
      const records = (packet.hostAcceptance as Record<string, unknown>).records as Array<
        Record<string, unknown>
      >;
      records[0]!.status = 'EXECUTED';
      records[0]!.result = { exitCode: 0, outputDigest: null, executedAtISO: null, notes: '' };
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.startsWith('host record codex') && !check.ok),
    ).toBe(true);
  });

  it('fail-closes when the bound stdout digest does not match the recomputed journey', () => {
    const packet = tampered((packet) => {
      const records = (packet.hostAcceptance as Record<string, unknown>).records as Array<
        Record<string, unknown>
      >;
      records[0]!.status = 'EXECUTED';
      records[0]!.result = executedResult({
        // Simulated stale generic multi-system demo output digest.
        outputDigest: `sha256:${createHash('sha256').update('generic career demo').digest('hex')}`,
      });
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some(
        (check) =>
          check.name.startsWith('host record codex') &&
          check.detail?.includes('does not match the recomputed bazi-career stdout'),
      ),
    ).toBe(true);
  });

  it('fail-closes when the source commit or input digest drifts from the packet', () => {
    const wrongCommit = tampered((packet) => {
      const records = (packet.hostAcceptance as Record<string, unknown>).records as Array<
        Record<string, unknown>
      >;
      records[0]!.status = 'EXECUTED';
      records[0]!.result = executedResult({ sourceCommit: '0'.repeat(40) });
    });
    expect(verifyIq4AcceptancePacket(wrongCommit).ok).toBe(false);

    const wrongInput = tampered((packet) => {
      const records = (packet.hostAcceptance as Record<string, unknown>).records as Array<
        Record<string, unknown>
      >;
      records[0]!.status = 'EXECUTED';
      records[0]!.result = executedResult({ inputDigest: 'sha256:' + 'b'.repeat(64) });
    });
    const result = verifyIq4AcceptancePacket(wrongInput);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some(
        (check) =>
          check.name.startsWith('host record codex') &&
          check.detail?.includes('inputDigest does not match'),
      ),
    ).toBe(true);
  });

  it('fail-closes on an EXECUTED record whose run failed', () => {
    const packet = tampered((packet) => {
      const records = (packet.hostAcceptance as Record<string, unknown>).records as Array<
        Record<string, unknown>
      >;
      records[0]!.status = 'EXECUTED';
      records[0]!.result = executedResult({ exitCode: 12 });
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some(
        (check) =>
          check.name.startsWith('host record codex') && check.detail?.includes('failed run'),
      ),
    ).toBe(true);
  });

  it('fail-closes when the owner review claims REVIEWED without a record', () => {
    const packet = tampered((packet) => {
      (packet.ownerReview as Record<string, unknown>).status = 'REVIEWED';
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.includes('owner review record') && !check.ok),
    ).toBe(true);
  });

  it('fail-closes on a forged owner review bound to a different artifact digest', () => {
    const packet = tampered((packet) => {
      (packet.ownerReview as Record<string, unknown>).status = 'REVIEWED';
      (packet.ownerReview as Record<string, unknown>).reviewRecord = {
        reviewId: 'review:synthetic:iq4-owner',
        reviewKind: 'independent',
        caseId: 'case:synthetic:career:iq4-acceptance',
        answerArtifactId: 'artifact:synthetic:iq4-career-answer',
        reviewedArtifactDigest: 'sha256:' + '0'.repeat(64),
        rubricId: 'rubric:answer-quality:career-v1',
        reviewerId: 'reviewer:anon:0123456789abcdef',
        reviewRound: 1,
        judgments: [
          'support-and-traceability',
          'mechanism-to-implication',
          'topic-specificity',
          'condition-and-caveat-fidelity',
          'cross-system-integrity',
          'restraint-and-boundaries',
          'presentation-cleanliness',
          'usefulness-without-invention',
        ].map((dimensionId) => ({ dimensionId, judgment: 'meets' })),
        failureModeIds: [],
        boundaryFindingIds: [
          'claim-support-resolves',
          'material-caveat-retained',
          'cross-system-separation-preserved',
          'deterministic-verdict-excluded',
          'default-footer-excluded',
        ],
        disposition: 'accept',
        sourceReviewIds: [],
        exclusionPolicy: ['synthetic-only'],
      };
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some(
        (check) =>
          check.name.includes('owner review record') &&
          check.detail?.includes('does not match the packet'),
      ),
    ).toBe(true);
  });

  it('fail-closes when the embedded journey evidence no longer matches the packet', () => {
    const packet = tampered((packet) => {
      packet.expectedViewClaimIds = ['approved-claim:fact-8'];
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.includes('recomputes to the expected') && !check.ok),
    ).toBe(true);
  });

  it('fail-closes on email-shaped strings anywhere in the packet', () => {
    const packet = tampered((packet) => {
      (packet.syntheticNotice as string) = '联系 someone@example.com 获取结果';
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.includes('no email-shaped strings') && !check.ok),
    ).toBe(true);
  });

  it(
    'binds the real CLI stdout digest to the recomputed expectation end to end',
    { timeout: 30_000 },
    () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'iq4g-packet-'));
      try {
        const inputFile = join(tempDir, 'bazi-career-input.json');
        writeFileSync(
          inputFile,
          canonicalJson((packetJourneyInput() as Record<string, unknown>).birthInput),
        );
        const run = spawnSync(
          process.execPath,
          [
            join(root, 'skills', 'xuan-ji-yu-heng', 'scripts', 'loom-chart.mjs'),
            'bazi-career',
            '--input-file',
            inputFile,
            '--system',
            'bazi',
            '--depth',
            'standard',
            '--now',
            '2026-01-01T00:00:00Z',
          ],
          { encoding: 'utf8' },
        );
        expect(run.status).toBe(0);
        const realStdoutDigest = `sha256:${createHash('sha256').update(run.stdout, 'utf8').digest('hex')}`;
        expect(realStdoutDigest).toBe(EXPECTED_STDOUT_DIGEST);
        const parsed = JSON.parse(run.stdout) as { responseView?: { system?: string } };
        expect(parsed.responseView?.system).toBe('bazi');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  );

  it('keeps the packet and verifier outside every runtime entry point', () => {
    for (const relative of [
      'packages/orchestrator/src/engine-entry.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'skills/xuan-ji-yu-heng/SKILL.md',
      'packages/contracts/src/index.ts',
      'packages/interpret/src/index.ts',
      'package.json',
    ]) {
      expect(read(relative), relative).not.toContain('iq4-acceptance-packet');
    }
  });
});
