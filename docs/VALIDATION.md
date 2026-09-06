# Validation strategy

Goal: prove that for a given input and ruleset, results are stable, match the ruleset, and are
source-traceable �?not that divination predicts anything (handoff §9).

## Gate (enforced now)

There are two explicit gates:

- `pnpm run verify:cloud` is the GitHub Actions gate. It runs every reproducible, non-sensitive
  check through `scan:secrets`; CI runs exactly this command.
- `pnpm run verify:all` is the controlled local gate: `verify:cloud` followed by
  `scan:incident`. The precise incident-token file is ignored and must never enter CI. If it is
  absent, the command fails closed instead of reporting a clean result.

Before a release or a visibility change, run `pnpm run verify:all` and
`pnpm run scan:incident:history` in a controlled environment.

| Stage            | Command (in `verify:cloud`)                       | What it proves                                                                                         |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Format           | `pnpm run format:check`                           | Prettier `--check`; formatting consistent repo-wide, no writes.                                        |
| Lint             | `pnpm run lint`                                   | ESLint import boundaries: offline compute core; no reverse dep on interpret.                           |
| Typecheck        | `pnpm run typecheck`                              | `tsc` strict over all packages, tools and tests (static gate beside lint).                             |
| Unit/property    | `pnpm run test`                                   | Vitest across contracts, time-location, orchestrator (incl. integration).                              |
| Build            | `pnpm run build`                                  | esbuild bundle + CycloneDX SBOM produced.                                                              |
| Provenance       | `pnpm run validate:provenance`                    | Built engine and live source retain the declared provenance boundary.                                  |
| Skill validate   | `pnpm run validate:skill`                         | Structure, frontmatter, portability, offline (no-network), CSP/no-script.                              |
| Reading validate | `pnpm run validate:reading`                       | Static contract for reading examples and output structure; no LLM call.                                |
| Docs validate    | `pnpm run validate:docs`                          | Current capability, runtime, publication-state and install-doc consistency.                            |
| Clean-dir smoke  | `pnpm run smoke`                                  | Offline run from an isolated copy + cross-env determinism.                                             |
| Forward test     | `pnpm run forward:test`                           | Clean-dir, zero-install, offline SKILL workflow for 5 realistic requests.                              |
| Host packages    | `pnpm run package:hosts && pnpm run verify:hosts` | Candidate ZIP structure and runtime behavior remain reproducible.                                      |
| Install state    | `pnpm run verify:install`                         | Root published state, immutable Release URL/SHA-256, and candidate boundary are honest and consistent. |
| Doc counts       | `pnpm run check:doc-counts`                       | Re-runs the suite; fails if a doc's `N tests / M files` drifts from the run.                           |
| Dep vuln scan    | `pnpm run scan:deps`                              | Local: WARN + exit 0 if offline. CI: `DEPENDENCY_AUDIT_STRICT=1` fails closed on unreachable/parse.    |
| License scan     | `pnpm run scan:licenses`                          | Offline `pnpm licenses` policy gate (LICENSE_AUDIT allowlist) + SBOM license cross-check; fail-closed. |
| SBOM validate    | `pnpm run validate:sbom`                          | Fresh esbuild bundle closure vs both committed SBOMs; any drift/ghost/byte diff fails closed.          |
| Secret scan      | `pnpm run scan:secrets`                           | Dependency-free scan of tracked files; fails on a leaked credential.                                   |
| Incident scan    | local `pnpm run verify:all`                       | Exact incident tokens; fail-closed if the controlled token file is unavailable.                        |

`pnpm run format:check` (Prettier) runs first in `verify:cloud`, so CI fails on any unformatted
file; run `pnpm run format` to auto-fix before pushing.

## Deferred to Phase 6 (declared, not yet enforced)

These items appear in the QODER_HANDOFF §9.1 long-term minimum bar but have no runnable
enforcement yet; they are intentionally excluded from `verify:cloud` and CI until implemented
(also tracked in STATUS). No not-yet-ready scanner is wired into the gate.

- Broader ESLint ruleset (style / type-aware rules) �?only the import-boundary gate
  (`eslint.config.js`, in `verify:cloud`) is enforced today; `typecheck` remains the other static gate.
- Dedicated / expanded HTML-injection suite beyond the template CSP, no-`<script>`, and
  no-network checks already run by `validate:skill`.

## Current results (2026-07-26)

The test count below comes from one real `pnpm run test` run �?the single source of truth shared with
the identical table in [STATUS.md](./STATUS.md) ("Commands & results"). Do not hand-edit it to
resolve a disagreement; re-run the suite and copy the actual count. `pnpm run check:doc-counts`
re-runs the suite and fails if either doc's `N tests / M files` count drifts from the real run.

- Typecheck: clean. Tests: **1149 tests / 83 files �?all passing**. The Western provider
  (astronomy-engine, VSOP87 + NOVAS) passes the ADR-0003 �?�?gate two ways: wrapper-consistency
  (vs astronomy-engine's own output) plus an **independent JPL Horizons golden** (10 bodies × 3
  technical epochs fetched from the NASA/JPL Horizons service, query recorded in
  `packages/western/goldens/jpl-horizons.json`; worst deviation 0.20�?; the sidereal zodiac (Lahiri), true node
  and asteroids have a dedicated **approximate** regression (continuity / sign-plausibility, not the
  �?�?gate); angles/houses are validated against the MC=RAMC and eastern-horizon oracles, the Zi Wei
  dynamic chart (运限�? is regression-anchored, the sourced BaZi interpretation rules (incl.
  刑冲合害/神煞/大运吉凶 `polarity`) are covered, and the cross-system interpretation-facts layer is
  checked for topic coverage, grounded evidence, `followupOffers`, de-identification and honest
  caveats. Skill validate: **40/40** (incl. the scripts/ no-stray-files guard, both SBOM checks and the validate-answer/lint-reading gate-workflow doc checks). Reading-example
  static validate: **36/36** (topic example libraries + output-spec structure + the Channel B
  V1 natural-delivery boundary + source trace; offline, no LLM �?it proves the spec/sample structure, **not** that a host
  model follows the style 100% of the time). Docs-consistency `validate:docs` passes (four full hosts /
  render disabled / no wrong-ephemeris attribution / dev Node �?24 vs run Node �?22, with positive+negative
  self-tests). Host packages are verified by extracting the REAL candidate zips (single top-level dir, no
  double-nesting, doctor/verify/calculate byte-identical to canonical). The same V1 delivery gate ships as `loom-chart.mjs lint-reading`
  (ADR 0011), which can lint a REAL produced report (`--channel topic [--simple]`) and exit non-zero on
  leaked delivery artifacts, generic consultant jargon, empty talk, repetition or unsupported claims �?still a static text gate, not a guarantee of host-model wording. Round 9 (ADR 0012) added an 空话 (vagueness) check: abstract judgements in default delivery must carry a concrete
  action/scene/observable/result nearby, and three REAL reports (male, 1990-06-15 14:20, 示例城市; 事业/感情/
  财运, saved unpolished to `docs/round9-acceptance/`) lint to 0 error (test #8 reads them). The detector is a
  nearby-concreteness heuristic, not a meaning judge. The `validate-answer` gate is a **deterministic
  structure-and-wording gate** over a host's ReadingDraft. Its ONLY public entry accepts UNKNOWN raw
  input: every call runs a bounded preflight (object-key counts/lengths, all array/text caps and
  whole-draft budgets, with static no-echo diagnostics) plus the full runtime schema before any
  content check �?malformed, over-limit or wrong-version input yields a stable not-ok result, never a
  crash. Legacy `reading-draft/v1` is REJECTED at runtime (a v0.2.0 breaking change; migration is a
  documented path, since accepting caller-selected v1 would re-enable the removed section-id fact
  exemption); results are emitted as `validation-result/v2` (breaking vs v1). Checks: fact-citation
  presence with exemption granted ONLY through `constraintRefs` into real AnswerPlan constraints,
  while every provided sourceFactId is unconditionally checked against `allowedFactIds`; a
  clause-anchored canonical safety-disclaimer mask (no free spans; double-negation prefixes,
  adversatives and line breaks never enter a mask); a normalized high-risk scan over **every heading
  and paragraph** in one shared pipeline (heading/text fields are plain text — HTML/entity/Markdown
  structural characters are rejected by `CONTAINS_MARKUP` before the scan; the scan strips Unicode
  `\p{Default_Ignorable_Code_Point}` and case-folds); caveat/warning consistency between `constraintRefs` and the attestation arrays; and
  per-item disclaimer coverage �?EVERY plan disclaimer must be referenced (error severity, explicit
  contract, no implicit ok). Violations carry only closed-set locators (sectionIndex / field /
  paragraphIndex / fixed patternKey values / itemIndex), never caller text, and are capped at
  `MAX_VIOLATIONS`. It **cannot** prove that a paragraph's meaning actually follows from its cited
  facts, cannot verify that a referenced caveat is truly expressed by the surrounding prose (the
  not-supported budget only verifies "short and fact-free" across headings+paragraphs), and its
  regex scan and canonical mask are bounded heuristics that cannot
  recognize every semantic paraphrase or deeper encoding; the resource limits bound the
  parse+validation stages only �?the CLI additionally caps the input file size before reading. It is
  a necessary wording gate, not a semantic-correctness proof. The dependency **license** gate (`scan:licenses`) enforces the
  LICENSE_AUDIT allowlist offline and cross-checks the committed SBOM license claims; `build` emits both a CycloneDX
  and an SPDX 2.3 SBOM (byte-stable, committed). Clean-dir offline
  smoke: **10/10**. Clean-dir forward test: **41/41** �?8 realistic requests (incl. a horoscope, an
  interpret and a multi-person 合婚 synastry) across the CLI, and that `render` is disabled (exit 3,
  no report file). Format:
  clean. `pnpm run verify:cloud` is the CI gate. `pnpm run verify:all` is only green in a controlled
  environment with the private incident-token file; without it, the expected result is fail-closed.

## Boundary fixtures (36; �?0 required for Phase 1)

`packages/test-fixtures` �?each fixture records why its expectation is trustworthy (documented
IANA transition dates, standard offsets, or plain wall↔UTC arithmetic), never an engine snapshot.

Covered: standard offsets incl. 30/45-min zones (Kolkata, Kathmandu, Eucla, Yangon); date line
(Kiritimati +14, Samoa 2011-12-30 skip); DST fall-back ambiguity + earlier/later resolution
(NY, London, Berlin, Sydney); spring-forward gaps; China historical DST (1988 summer UTC+9 vs
winter UTC+8); different longitudes �?different mean solar time; near day/zi-hour boundaries;
unknown & approximate time; out-of-range years; unknown timezone; lunar-not-yet.

Property tests: wall↔UTC round-trip invariant; equation-of-time bounds; apparent = mean + EoT;
canonical-JSON order independence; deterministic hashing; calculate determinism.

## Golden-sample requirements (Phase 2+)

- Each fixture: source URL/citation, collection date, ruleset, expected result, tolerance, and
  why it is trustworthy.
- Western: at least one set cross-checked against JPL/Swiss; main-body positions within �?
  arc-minute; discrete classifications (sign/house changes) must match exactly. (Planetary
  longitudes: met via the JPL Horizons golden; house cusps: met via the Swiss Ephemeris house golden.)
- BaZi/Zi Wei: sourced references, NOT another wrapper of the same core library.
- Snapshots guard against regressions only; they never become ground truth.
- Minimum targets: time/location 30 (met: 36), Western 20 (met: 55 �?JPL Horizons golden
  longitudes + 25 Swiss Ephemeris house-cusp sets), BaZi 40, Zi Wei 20.

## Must-test boundaries (tracked to Phase 2)

Solar-term crossings ±120 s; 23:00/00:00 and zi-hour day-change rules; leap month & lunar
conversion; multiple luck-cycle-start algorithms; high-latitude house-system failure; planet
sign/house/aspect/retrograde-station edges; Chinese-vs-English triggers and non-chart "star
chart" negative triggers; HTML injection/CSP; offline run; no-source-workspace install.
