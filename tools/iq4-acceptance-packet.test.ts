import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, canonicalJsonPretty } from '../packages/contracts/src/ids.ts';
import { describe, expect, it } from 'vitest';
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

function allHostsExecuted(packet: Record<string, unknown>): void {
  const records = (packet.hostAcceptance as Record<string, unknown>).records as Array<
    Record<string, unknown>
  >;
  for (const record of records) {
    record.status = 'EXECUTED';
    record.result = executedResult();
  }
  (packet.hostAcceptance as Record<string, unknown>).status = 'EXECUTED';
}

// The retired IQ-4G artifacts: text claims bound to unadmitted rule content
// (bazi-rule/pattern = 格局; bazi-rule/industry/wu-xing = 喜用神行业匹配).
const RETIRED_TRACES = [
  {
    contractVersion: 'narrative-trace/v1',
    traceId: 'narrative-trace:paragraph-1',
    paragraphId: 'paragraph-1',
    topic: 'career',
    approvedClaimIds: ['approved-claim:fact-7'],
    factRefs: ['fact-7'],
    mechanismRefs: ['bazi.pillars.*.tenGod', 'bazi-rule/pattern'],
    constraintRefs: [{ kind: 'caveat', index: 0 }],
    invalidationCauses: [
      'input-chart',
      'settings',
      'engine-provider',
      'ruleset',
      'source-profile',
      'topic-lens',
      'language-narrator',
    ],
    visibleText: '（已退役的 IQ-4G 合成叙述示例，依赖未准入的格局规则内容。）',
    transient: true,
    regenerable: true,
  },
  {
    contractVersion: 'narrative-trace/v1',
    traceId: 'narrative-trace:paragraph-2',
    paragraphId: 'paragraph-2',
    topic: 'career',
    approvedClaimIds: ['approved-claim:fact-96'],
    factRefs: ['fact-96'],
    mechanismRefs: ['bazi-rule/industry/wu-xing'],
    constraintRefs: [{ kind: 'caveat', index: 3 }],
    invalidationCauses: [
      'input-chart',
      'settings',
      'engine-provider',
      'ruleset',
      'source-profile',
      'topic-lens',
      'language-narrator',
    ],
    visibleText: '（已退役的 IQ-4G 合成叙述示例，依赖未准入的喜用神行业匹配内容。）',
    transient: true,
    regenerable: true,
  },
];

describe('IQ-4H acceptance packet (strict source gate)', () => {
  it('ships a v3 packet with no reviewable artifacts and a green verification', () => {
    const packet = loadIq4AcceptancePacket() as Record<string, unknown>;
    expect(packet.packetId).toBe('iq4-acceptance-packet/v3');
    expect(packet.traces).toBeUndefined();
    expect(packet.answerDraft).toBeUndefined();
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok, JSON.stringify(result.checks.filter((check) => !check.ok))).toBe(true);
  });

  it('records the reviewed-answer-examples criterion as BLOCKED_SOURCE_ADMISSION', () => {
    const packet = loadIq4AcceptancePacket() as Record<string, unknown>;
    const iq4Exit = packet.iq4Exit as Record<string, unknown>;
    expect(iq4Exit.status).toBe('BLOCKED_SOURCE_ADMISSION');
    expect(iq4Exit.criterion).toBe('reviewed-answer-examples');
    const ownerReview = packet.ownerReview as Record<string, unknown>;
    expect(ownerReview.status).toBe('BLOCKED_SOURCE_ADMISSION');
    expect(ownerReview.reviewRecord).toBeNull();
  });

  it('fail-closes when the retired unadmitted traces are injected', () => {
    const packet = tampered((packet) => {
      packet.traces = RETIRED_TRACES;
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some(
        (check) => check.name.includes('no reviewable career artifacts') && !check.ok,
      ),
    ).toBe(true);
  });

  it('fail-closes when the retired answer draft or its digest is injected', () => {
    const draftOnly = tampered((packet) => {
      packet.answerDraft = { contractVersion: 'reading-draft/v2', topic: 'career' };
    });
    expect(verifyIq4AcceptancePacket(draftOnly).ok).toBe(false);

    const digestOnly = tampered((packet) => {
      packet.reviewedArtifactDigest = 'sha256:' + '0'.repeat(64);
    });
    expect(verifyIq4AcceptancePacket(digestOnly).ok).toBe(false);
  });

  it('fail-closes on any owner review status other than the source-blocked state', () => {
    for (const status of ['REVIEWED', 'NOT_EXECUTED', 'PENDING']) {
      const packet = tampered((packet) => {
        (packet.ownerReview as Record<string, unknown>).status = status;
      });
      const result = verifyIq4AcceptancePacket(packet);
      expect(result.ok, status).toBe(false);
      expect(
        result.checks.some(
          (check) => check.name.includes('BLOCKED_SOURCE_ADMISSION governance state') && !check.ok,
        ),
      ).toBe(true);
    }
  });

  it('fail-closes on an injected owner review record while blocked', () => {
    const packet = tampered((packet) => {
      (packet.ownerReview as Record<string, unknown>).reviewRecord = {
        reviewId: 'review:synthetic:iq4-owner',
        disposition: 'accept',
      };
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.includes('carries no review record') && !check.ok),
    ).toBe(true);
  });

  it('fail-closes on an injected "IQ-4 passed" exit state', () => {
    const packet = tampered((packet) => {
      (packet.iq4Exit as Record<string, unknown>).status = 'passed';
    });
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((check) => check.name.includes('iq4 exit records') && !check.ok),
    ).toBe(true);
  });

  it('keeps four-host EXECUTED as technical evidence that cannot lift the source block', () => {
    const packet = tampered((packet) => allHostsExecuted(packet)) as Record<string, unknown>;
    const result = verifyIq4AcceptancePacket(packet);
    expect(result.ok, JSON.stringify(result.checks.filter((check) => !check.ok))).toBe(true);
    const iq4Exit = (packet.iq4Exit as Record<string, unknown>).status;
    expect(iq4Exit).toBe('BLOCKED_SOURCE_ADMISSION');

    const passed = tampered((packet) => {
      allHostsExecuted(packet);
      (packet.iq4Exit as Record<string, unknown>).status = 'passed';
    });
    expect(verifyIq4AcceptancePacket(passed).ok).toBe(false);
  });

  it('fail-closes when a bound stdout digest does not match the recomputed journey', () => {
    const packet = tampered((packet) => {
      const records = (packet.hostAcceptance as Record<string, unknown>).records as Array<
        Record<string, unknown>
      >;
      records[0]!.status = 'EXECUTED';
      records[0]!.result = executedResult({
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
    expect(verifyIq4AcceptancePacket(wrongInput).ok).toBe(false);
  });

  it(
    'binds the real CLI stdout digest to the recomputed expectation end to end',
    { timeout: 30_000 },
    () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'iq4h-packet-'));
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
