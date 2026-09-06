import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { canonicalJson, canonicalJsonPretty } from '../../packages/contracts/src/ids.ts';
import { HOSTS } from '../lib/host-config.ts';
import { runBaziCareerJourney } from '../../packages/orchestrator/src/bazi-career-journey.ts';

/**
 * IQ-4H acceptance-packet verifier (packet v3, strict source gate). There is
 * currently NO source-admitted visible BaZi career claim: every existing text
 * claim depends on rule content (pattern, useful-god industry matching) that
 * has not passed source admission. The packet therefore carries no reviewable
 * narrative, trace, answer draft, or artifact digest at all, and the
 * reviewed-answer-examples exit criterion is recorded as
 * BLOCKED_SOURCE_ADMISSION — a governance state that four-host technical
 * acceptance cannot lift. Host records still bind the IQ-4F bazi-career
 * evidence cryptographically (source commit, candidate ZIP digest, input
 * digest, and a stdout digest the verifier recomputes from the journey);
 * pending is never pass, and any injected legacy artifact, REVIEWED status,
 * or "IQ-4 passed" claim fails closed.
 *
 * Anti-forgery boundary (deliberate): static completeness and binding only.
 * Authenticity of an EXECUTED record rests on the owner's git-reviewed
 * commit; nothing here auto-approves anything.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const PACKET_PATH = join(root, 'evals', 'fixtures', 'synthetic', 'iq4-acceptance-packet.json');

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

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
  add('packet id is iq4-acceptance-packet/v3', packet.packetId === 'iq4-acceptance-packet/v3');

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

  // Full-chain link: recompute the journey to derive the expected
  // bazi-career stdout digest that EXECUTED host records must bind. Reviewable
  // career artifacts are forbidden entirely while source admission is blocked.
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
  } catch {
    claimsMatch = false;
    journeyRecomputed = false;
  }
  add('embedded journey recomputes to the expected single-system view', claimsMatch);
  add('expected bazi-career stdout digest derived from the journey', journeyRecomputed);

  // Strict source gate: no reviewable career artifact of any kind may ride
  // along while the reviewed-answer-examples criterion is source-blocked.
  // The check is structural (artifact presence), not a keyword blacklist.
  const carriesReviewableArtifacts =
    packet.traces !== undefined ||
    packet.answerDraft !== undefined ||
    packet.answerArtifactDigest !== undefined ||
    packet.reviewedArtifactDigest !== undefined;
  add(
    'packet carries no reviewable career artifacts while source admission is blocked',
    !carriesReviewableArtifacts,
  );

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

  // Owner review: the source block is a governance state with a single legal
  // value. REVIEWED, pending, or any other status fails closed, and no review
  // record may exist because there is no admissible reviewable artifact.
  const ownerReview = packet.ownerReview;
  if (!isRecord(ownerReview)) {
    add('owner review section present', false);
  } else {
    add(
      'owner review records the BLOCKED_SOURCE_ADMISSION governance state',
      ownerReview.status === 'BLOCKED_SOURCE_ADMISSION',
      ownerReview.status === 'BLOCKED_SOURCE_ADMISSION'
        ? undefined
        : 'only BLOCKED_SOURCE_ADMISSION is expressible; REVIEWED or pending statuses fail closed',
    );
    add(
      'owner review vocabulary cannot express approval while blocked',
      Array.isArray(ownerReview.statusVocabulary) &&
        ownerReview.statusVocabulary.length === 1 &&
        ownerReview.statusVocabulary[0] === 'BLOCKED_SOURCE_ADMISSION',
    );
    add('blocked owner review carries no review record', ownerReview.reviewRecord === null);
  }

  // IQ-4 exit state: machine-verifiable and never passable through host runs.
  const iq4Exit = packet.iq4Exit;
  if (!isRecord(iq4Exit)) {
    add('iq4 exit state present', false);
  } else {
    add(
      'iq4 exit records BLOCKED_SOURCE_ADMISSION for reviewed-answer-examples',
      iq4Exit.status === 'BLOCKED_SOURCE_ADMISSION' &&
        iq4Exit.criterion === 'reviewed-answer-examples',
      iq4Exit.status === 'BLOCKED_SOURCE_ADMISSION'
        ? undefined
        : 'injected "IQ-4 passed" or REVIEWED exit states fail closed',
    );
  }

  // Privacy: no email-shaped strings anywhere in the packet.
  const emailHit = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(JSON.stringify(packet));
  add('packet contains no email-shaped strings', !emailHit);

  return { ok: checks.every((check) => check.ok), checks };
}

export function loadIq4AcceptancePacket(): unknown {
  return JSON.parse(readFileSync(PACKET_PATH, 'utf8'));
}
