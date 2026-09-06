import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../packages/contracts/src/ids.ts';
import { describe, expect, it } from 'vitest';
import { HOSTS } from './lib/host-config.ts';
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

const ARTIFACT_DIGEST = `sha256:${createHash('sha256')
  .update(canonicalJson((loadIq4AcceptancePacket() as Record<string, unknown>).answerDraft))
  .digest('hex')}`;

describe('IQ-4E acceptance packet', () => {
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

  it('accepts a well-formed owner review bound to the packet artifact digest', () => {
    const packet = tampered((packet) => {
      (packet.ownerReview as Record<string, unknown>).status = 'REVIEWED';
      (packet.ownerReview as Record<string, unknown>).reviewRecord = {
        reviewId: 'review:synthetic:iq4-owner',
        reviewKind: 'independent',
        caseId: 'case:synthetic:career:iq4-acceptance',
        answerArtifactId: 'artifact:synthetic:iq4-career-answer',
        reviewedArtifactDigest: ARTIFACT_DIGEST,
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
    expect(result.ok, JSON.stringify(result.checks.filter((check) => !check.ok))).toBe(true);
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
