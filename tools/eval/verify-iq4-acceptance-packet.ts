import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { canonicalJson, canonicalJsonPretty } from '../../packages/contracts/src/ids.ts';
import { HOSTS } from '../lib/host-config.ts';
import { runBaziCareerJourney } from '../../packages/orchestrator/src/bazi-career-journey.ts';
import { verifyBaziCareerAnswer } from '../../packages/orchestrator/src/bazi-career-answer.ts';
import { verifyBaziCareerNarrative } from '../../packages/orchestrator/src/bazi-career-narrative.ts';
import { NarrativeTrace } from '../../packages/contracts/src/answer-claim.ts';

/**
 * IQ-4G acceptance-packet verifier (packet v2). Host acceptance targets the
 * IQ-4F explicit bazi-career runtime entry only: an EXECUTED host record must
 * bind the source commit, the installed candidate ZIP's sha256, the packet
 * input digest, and the sha256 of the captured bazi-career stdout — and that
 * stdout digest must equal the digest the verifier recomputes from the
 * journey itself. Stale generic multi-system demo output, fabricated output,
 * and any other input therefore fail closed. Pending is never pass, and the
 * owner review keeps its own independent pending/approved boundary over the
 * trace-bound answer artifact.
 *
 * Anti-forgery boundary (deliberate): static completeness and binding only.
 * Authenticity of an EXECUTED record rests on the owner's git-reviewed
 * commit; nothing here auto-approves anything.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const PACKET_PATH = join(root, 'evals', 'fixtures', 'synthetic', 'iq4-acceptance-packet.json');

const RUBRIC_DIMENSION_IDS = [
  'support-and-traceability',
  'mechanism-to-implication',
  'topic-specificity',
  'condition-and-caveat-fidelity',
  'cross-system-integrity',
  'restraint-and-boundaries',
  'presentation-cleanliness',
  'usefulness-without-invention',
] as const;

const JUDGMENT_VALUES = ['meets', 'needs-review', 'does-not-meet', 'not-applicable'];

const FAILURE_MODE_IDS = new Set([
  'vague-prose',
  'term-dump',
  'unsupported-fact',
  'mechanism-leap',
  'cross-system-consensus-fabrication',
  'repeated-conclusion',
  'default-footer-clutter',
  'missing-material-condition',
  'jargon-without-concrete-implication',
  'unsupported-life-verdict',
]);

const BOUNDARY_FINDING_IDS = new Set([
  'claim-support-resolves',
  'mechanism-adjacent-to-implication',
  'topic-scope-respected',
  'material-caveat-retained',
  'unrelated-warning-omitted',
  'cross-system-separation-preserved',
  'unsupported-life-fact-excluded',
  'deterministic-verdict-excluded',
  'default-footer-excluded',
  'audit-metadata-hidden',
  'insufficient-evidence-degrades',
  'automatic-followup-excluded',
]);

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const REVIEWER_ID_PATTERN = /^reviewer:anon:[a-f0-9]{16}$/;
const REVIEW_ID_PATTERN = /^review:synthetic:[a-z0-9][a-z0-9._-]*$/;
const CASE_ID_PATTERN = /^case:synthetic:career:[a-z0-9][a-z0-9._-]*$/;
const ARTIFACT_ID_PATTERN = /^artifact:synthetic:[a-z0-9][a-z0-9._-]*$/;

export interface PacketCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

type Packet = Record<string, unknown>;

function isRecord(value: unknown): value is Packet {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkHostRecord(
  hostId: string,
  record: unknown,
  hostConfig: (typeof HOSTS)[number],
  runtimeEntry: Packet,
  expectedStdoutDigest: string,
  expectedInputDigest: string,
): string | null {
  if (!isRecord(record)) return `record for ${hostId} is not an object`;
  if (record.hostId !== hostId) return `record hostId mismatch`;
  if (record.engineSelfCheck !== hostConfig.engineSelfCheck) {
    return `engineSelfCheck does not match the host config`;
  }
  const status = record.status;
  if (status === 'NOT_EXECUTED') return null;
  if (status === 'EXECUTED') {
    const result = record.result;
    if (!isRecord(result)) return `EXECUTED record has no result object`;
    if (typeof result.exitCode !== 'number') return `EXECUTED record lacks a numeric exitCode`;
    if (result.exitCode !== 0) return `EXECUTED record records a failed run`;
    if (typeof result.outputDigest !== 'string' || !SHA256_PATTERN.test(result.outputDigest)) {
      return `EXECUTED record lacks a sha256 outputDigest`;
    }
    // Master binding: the captured bazi-career stdout must hash exactly to
    // what the verifier recomputes from the journey. Old generic demo output,
    // fabricated text, and different inputs can never match.
    if (result.outputDigest !== expectedStdoutDigest) {
      return `outputDigest does not match the recomputed bazi-career stdout`;
    }
    if (typeof result.sourceCommit !== 'string' || !COMMIT_PATTERN.test(result.sourceCommit)) {
      return `EXECUTED record lacks a 40-hex sourceCommit`;
    }
    if (result.sourceCommit !== runtimeEntry.sourceCommit) {
      return `sourceCommit does not match the packet's runtime entry`;
    }
    if (
      typeof result.candidateSha256 !== 'string' ||
      !SHA256_PATTERN.test(result.candidateSha256)
    ) {
      return `EXECUTED record lacks the installed candidate ZIP sha256`;
    }
    if (typeof result.inputDigest !== 'string' || result.inputDigest !== expectedInputDigest) {
      return `inputDigest does not match the packet's synthetic input`;
    }
    if (typeof result.executedAtISO !== 'string' || !ISO_DATE_PATTERN.test(result.executedAtISO)) {
      return `EXECUTED record lacks an executedAtISO date`;
    }
    if (typeof result.notes !== 'string' || result.notes.length === 0) {
      return `EXECUTED record lacks notes`;
    }
    return null;
  }
  return `unknown host record status (pending is never pass)`;
}

function checkOwnerReviewRecord(record: unknown, expectedArtifactDigest: string): string | null {
  if (!isRecord(record)) return `owner review record is missing`;
  for (const key of [
    'reviewId',
    'reviewKind',
    'caseId',
    'answerArtifactId',
    'reviewedArtifactDigest',
    'reviewerId',
    'reviewRound',
    'judgments',
    'failureModeIds',
    'boundaryFindingIds',
    'disposition',
    'sourceReviewIds',
    'exclusionPolicy',
  ]) {
    if (!(key in record)) return `review record is missing ${key}`;
  }
  if (typeof record.reviewId !== 'string' || !REVIEW_ID_PATTERN.test(record.reviewId)) {
    return `reviewId does not follow the review contract pattern`;
  }
  if (typeof record.reviewerId !== 'string' || !REVIEWER_ID_PATTERN.test(record.reviewerId)) {
    return `reviewerId must be an anonymous reviewer id (no names or emails)`;
  }
  if (typeof record.caseId !== 'string' || !CASE_ID_PATTERN.test(record.caseId)) {
    return `caseId does not follow the review contract pattern`;
  }
  if (
    typeof record.answerArtifactId !== 'string' ||
    !ARTIFACT_ID_PATTERN.test(record.answerArtifactId)
  ) {
    return `answerArtifactId does not follow the review contract pattern`;
  }
  if (
    typeof record.reviewedArtifactDigest !== 'string' ||
    !SHA256_PATTERN.test(record.reviewedArtifactDigest)
  ) {
    return `reviewedArtifactDigest must be sha256`;
  }
  // Anti-forgery binding: the review must be over the packet's own embedded
  // answer artifact, not some unreachable text.
  if (record.reviewedArtifactDigest !== expectedArtifactDigest) {
    return `reviewedArtifactDigest does not match the packet's embedded answer artifact`;
  }
  if (record.reviewKind !== 'independent' && record.reviewKind !== 'reconciliation') {
    return `reviewKind is outside the contract vocabulary`;
  }
  if (!Array.isArray(record.judgments) || record.judgments.length !== 8) {
    return `judgments must contain exactly the eight rubric dimensions`;
  }
  for (const [index, entry] of record.judgments.entries()) {
    if (!isRecord(entry)) return `judgment ${index} is not an object`;
    if (entry.dimensionId !== RUBRIC_DIMENSION_IDS[index]) {
      return `judgment ${index} is not the rubric-ordered dimension`;
    }
    if (!JUDGMENT_VALUES.includes(entry.judgment as string)) {
      return `judgment ${index} uses a value outside the contract vocabulary`;
    }
  }
  const checkIdSet = (value: unknown, set: Set<string>): string | null => {
    if (!Array.isArray(value)) return `expected an array of contract ids`;
    for (const id of value) {
      if (typeof id !== 'string' || !set.has(id)) return `id outside the contract vocabulary`;
    }
    return null;
  };
  const failureIssue = checkIdSet(record.failureModeIds, FAILURE_MODE_IDS);
  if (failureIssue) return failureIssue;
  const boundaryIssue = checkIdSet(record.boundaryFindingIds, BOUNDARY_FINDING_IDS);
  if (boundaryIssue) return boundaryIssue;
  if (
    record.disposition !== 'accept' &&
    record.disposition !== 'revise' &&
    record.disposition !== 'reject' &&
    record.disposition !== 'reconciliation-required'
  ) {
    return `disposition is outside the contract vocabulary`;
  }
  if (!Array.isArray(record.sourceReviewIds)) return `sourceReviewIds must be an array`;
  if (record.reviewKind === 'independent' && record.sourceReviewIds.length > 0) {
    return `independent reviews cite no other reviews`;
  }
  if (record.reviewKind === 'reconciliation' && record.sourceReviewIds.length < 2) {
    return `reconciliation reviews cite at least two distinct reviews`;
  }
  if (
    !Array.isArray(record.exclusionPolicy) ||
    record.exclusionPolicy.length === 0 ||
    !(record.exclusionPolicy as unknown[]).every((id) => typeof id === 'string')
  ) {
    return `exclusionPolicy must be a non-empty array of ids`;
  }
  return null;
}

export function verifyIq4AcceptancePacket(packet: unknown): {
  ok: boolean;
  checks: PacketCheck[];
} {
  const checks: PacketCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string): void => {
    checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
  };

  add(
    'packet declares synthetic-technical fixture kind',
    isRecord(packet) && packet.fixtureKind === 'synthetic-technical',
  );
  if (!isRecord(packet)) {
    add('packet is a JSON object', false);
    return { ok: false, checks };
  }
  add('packet id is iq4-acceptance-packet/v2', packet.packetId === 'iq4-acceptance-packet/v2');

  // IQ-4F explicit runtime entry binding: the acceptance target is the
  // bazi-career command at a pinned source commit over the packet input.
  const runtimeEntry = packet.runtimeEntry;
  let runtimeEntryOk = false;
  let expectedInputDigest = '';
  if (isRecord(runtimeEntry)) {
    runtimeEntryOk =
      typeof runtimeEntry.sourceCommit === 'string' &&
      COMMIT_PATTERN.test(runtimeEntry.sourceCommit) &&
      typeof runtimeEntry.command === 'string' &&
      runtimeEntry.command.includes('bazi-career') &&
      runtimeEntry.command.includes('--system bazi');
    add('runtime entry pins the explicit bazi-career command and source commit', runtimeEntryOk);
    if (isRecord(packet.journeyInput)) {
      expectedInputDigest = `sha256:${createHash('sha256')
        .update(canonicalJson(packet.journeyInput.birthInput))
        .digest('hex')}`;
      add(
        'runtime entry input digest matches the packet synthetic input',
        runtimeEntry.inputDigest === expectedInputDigest,
      );
    } else {
      add('runtime entry input digest matches the packet synthetic input', false);
    }
  } else {
    add('runtime entry pins the explicit bazi-career command and source commit', false);
  }

  // Full-chain link: recompute the journey and verify the embedded answer and
  // traces against the recomputed evidence; also derive the expected
  // bazi-career stdout digest that EXECUTED host records must bind.
  let answerVerified = false;
  let narrativeVerified = false;
  let claimsMatch = false;
  let journeyRecomputed = false;
  let expectedStdoutDigest = '';
  try {
    const journey = runBaziCareerJourney(packet.journeyInput, { now: packet.fixedNow as number });
    journeyRecomputed = true;
    const viewClaimIds = journey.responseView.approvedClaimIds;
    const expectedClaimIds = packet.expectedViewClaimIds as unknown[];
    claimsMatch =
      Array.isArray(expectedClaimIds) &&
      viewClaimIds.length === expectedClaimIds.length &&
      viewClaimIds.every((id, index) => expectedClaimIds[index] === id);
    expectedStdoutDigest = `sha256:${createHash('sha256')
      .update(
        `${canonicalJsonPretty({ ok: true, clarificationPlan: journey.clarificationPlan, responseView: journey.responseView })}\n`,
      )
      .digest('hex')}`;
    narrativeVerified = verifyBaziCareerNarrative(
      packet.traces as readonly unknown[],
      packet.journeyInput,
      { now: packet.fixedNow as number },
    ).ok;
    answerVerified = verifyBaziCareerAnswer(
      packet.answerDraft,
      packet.traces as readonly unknown[],
      packet.journeyInput,
      { now: packet.fixedNow as number },
    ).ok;
  } catch {
    claimsMatch = false;
    narrativeVerified = false;
    answerVerified = false;
    journeyRecomputed = false;
  }
  add('embedded journey recomputes to the expected single-system view', claimsMatch);
  add('expected bazi-career stdout digest derived from the journey', journeyRecomputed);
  add('embedded traces link every claim and caveat of the journey', narrativeVerified);
  add('embedded answer draft passes journey-level answer verification', answerVerified);

  const tracesOk =
    Array.isArray(packet.traces) &&
    packet.traces.every((trace) => NarrativeTrace.safeParse(trace).success);
  add('embedded paragraph traces follow narrative-trace/v1', tracesOk);

  // Host acceptance records: dynamically matched against the real host
  // configuration; pending is never pass, EXECUTED requires full evidence.
  const hostAcceptance = packet.hostAcceptance;
  if (!isRecord(hostAcceptance) || !Array.isArray(hostAcceptance.records)) {
    add('host acceptance section present with records', false);
  } else {
    add(
      'host acceptance status is within the recorded vocabulary',
      hostAcceptance.status === 'NOT_EXECUTED' || hostAcceptance.status === 'EXECUTED',
    );
    const configuredIds = HOSTS.map((host) => host.id);
    const recordIds = hostAcceptance.records.map((record) =>
      isRecord(record) ? record.hostId : null,
    );
    add(
      `host records cover exactly the configured hosts (${configuredIds.join(', ')})`,
      recordIds.length === configuredIds.length &&
        configuredIds.every((id, index) => recordIds[index] === id),
    );
    for (const [index, host] of HOSTS.entries()) {
      const detail = checkHostRecord(
        host.id,
        hostAcceptance.records[index],
        host,
        isRecord(runtimeEntry) ? runtimeEntry : {},
        expectedStdoutDigest,
        expectedInputDigest,
      );
      add(
        `host record ${host.id} is pending or fully evidenced`,
        detail === null,
        detail ?? undefined,
      );
    }
  }

  // Owner review: pending with a null record; REVIEWED requires a complete,
  // contract-shaped record. A forged approval without a record fails closed.
  const ownerReview = packet.ownerReview;
  if (!isRecord(ownerReview)) {
    add('owner review section present', false);
  } else {
    add(
      'owner review status is within the recorded vocabulary',
      ownerReview.status === 'NOT_EXECUTED' || ownerReview.status === 'REVIEWED',
    );
    if (ownerReview.status === 'NOT_EXECUTED') {
      add('pending owner review carries no review record', ownerReview.reviewRecord === null);
    } else if (ownerReview.status === 'REVIEWED') {
      const expectedArtifactDigest = `sha256:${createHash('sha256')
        .update(canonicalJson(packet.answerDraft))
        .digest('hex')}`;
      const detail = checkOwnerReviewRecord(ownerReview.reviewRecord, expectedArtifactDigest);
      add(
        'owner review record follows answer-quality-review/v1',
        detail === null,
        detail ?? undefined,
      );
    } else {
      add('owner review status is outside the recorded vocabulary', false);
    }
  }

  // Privacy: no email-shaped strings anywhere in the packet.
  const emailHit = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(JSON.stringify(packet));
  add('packet contains no email-shaped strings', !emailHit);

  return { ok: checks.every((check) => check.ok), checks };
}

export function loadIq4AcceptancePacket(): unknown {
  return JSON.parse(readFileSync(PACKET_PATH, 'utf8'));
}
