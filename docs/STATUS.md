# STATUS

> Updated: 2026-07-26 · Phase W5 (吉凶 facts + sidereal/true-node/asteroids + 解读风格，HTML/SVG 报告暂停) complete �?**expansion roadmap W1–W5 done** · engine `0.1.0` / schema `0.1.0`

## Where the project lives

The public home is the sanitized repository `github.com/Jowitt13/loom-of-heaven` (after a PII
incident the public history was rewritten and republished; see
[INCIDENT_PII_REMEDIATION.md](./INCIDENT_PII_REMEDIATION.md)). The original handoff document is
kept at the repository root as `QODER_HANDOFF.md` for continuity. Pre-incident workspaces are
retired and must never be pushed from or copied from.

## Done

### Phase 0 �?design freeze & risk verification

- pnpm monorepo scaffolded: `packages/{contracts,time-location,orchestrator,test-fixtures}`,
  `tools/`, `skills/xuan-ji-yu-heng/`, `docs/`.
- Dependency versions/licenses verified against the live npm registry (see `docs/LICENSE_AUDIT.md`).
- ADRs 0001�?004 (skill-first, TZDB, providers, toolchain). Docs: PRODUCT_SPEC, ARCHITECTURE,
  RULESETS, VALIDATION, LICENSE_AUDIT, PRIVACY, WORKBUDDY.
- Versioned contracts (`BirthInput`, `NormalizedBirthData`, `ChartBundle`, warnings/errors/
  provenance) with canonical JSON + deterministic id.
- TZDB decision fixed via ADR: bundled, version-pinned moment-timezone (`dataVersion 2026c`).
- Packaged Skill skeleton: minimal `SKILL.md` (frontmatter = name + description only),
  `agents/openai.yaml`, single CLI, references, report template, LICENSE, notices, SBOM.
- `tools/validate-skill.ts` passes.

### Phase 1 �?time, location & public contract

- `packages/time-location`: TZDB wrapper, DST disambiguation (ambiguous �?`AMBIGUOUS_LOCAL_TIME`,
  non-existent �?`NONEXISTENT_LOCAL_TIME`), UTC instant, mean/apparent solar time (NOAA EoT),
  full normalize + time-layer warnings + public projection.
- CLI verbs implemented: `doctor`, `normalize`, `calculate`, `compare`, `interpret`, `verify`.
  (`render` is temporarily disabled �?returns a stable notice + exit 3; see ADR 0005.)
- No JavaScript `Date` in public contracts; ISO strings + explicit instant. No hardcoded
  UTC+8/120°E �?historical DST honored (e.g. Shanghai 1988 summer �?UTC+9).
- 36 sourced boundary fixtures (�?0 required) + unit/property tests.
- SKILL.md, agents/openai.yaml, references, assets, LICENSE, THIRD_PARTY_NOTICES, SBOM.

### Phase 2 �?BaZi, Zi Wei & lunar conversion

- `packages/bazi` (tyme4ts 1.5.2, MIT): Four Pillars, hidden stems, ten gods, na yin, zodiac,
  luck cycle (大运/起运). Lunar→Gregorian conversion with leap-month support.
- `packages/ziwei` (iztro 2.5.8, MIT): natal twelve palaces, stars with brightness and
  四化, major limits (大限), 命主/身主, five-elements class.
- Both providers hidden behind typed adapters; public contracts never expose third-party types.
- Provider provenance and ruleset references flow into every `ChartBundle` automatically.
- HTML report: BaZi four-pillar table with hidden stems, ten gods, na yin; Zi Wei twelve-palace
  table with star placements and decadal (大限) ranges. Only Western remains "pending" in the UI.
- Western provider evaluated and **rejected at the ADR 0003 gate**: celestine 0.2.1 agrees with
  the wrapper-consistency cross-check (astronomy-engine, VSOP87 + NOVAS) to �?�?for Sun–Neptune but deviates up
  to ~17�?(Mercury) and ~37�?(Pluto). Reproducible regression in
  `packages/western/test/precision-regression.test.ts` (2 `it.fails` encode the gate).
- Current state: **2 of 3 systems computed** (BaZi + Zi Wei + lunar; Western gated by ADR 0003).

### Phase 3 �?installable Skill & self-contained CLI

- Forward-test harness `tools/forward-test.ts`: copies ONLY the published Skill into an OS temp
  dir outside the repo (no `packages/`, no `node_modules`, zero `npm install`, fully offline) and
  walks the SKILL.md workflow for **5 realistic requests** (�?the 3 the Phase 3 bar requires).
- All six subcommands proven in the clean dir �?`doctor`, `normalize`, `calculate`, `compare`,
  `render`, `verify`; `normalize` and `compare` are newly covered beyond the clean-dir smoke.
- Degradation paths proven honest (nothing fabricated):
  - unknown time �?`TIME_UNKNOWN`; Zi Wei omitted + `ZIWEI_INPUT_REQUIRED`; BaZi hour pillar and
    luck cycle `null` while year/month/day pillars remain;
  - approximate time �?`TIME_ACCURACY_APPROXIMATE`, charts still computed;
  - lunar input �?`LUNAR_CONVERTED` (lunar 1990-01-01 �?Gregorian 1990-01-27), charts computed.
- Western is integrated via astronomy-engine and computes all supported systems; unsupported or invalid inputs return structured errors or warnings — results are never fabricated.
- Byte-identical canonical JSON between the source CLI and the isolated Skill reaffirmed.
- `pnpm run forward:test` wired into `verify:all` as an enforced gate (runs after `smoke`).

### Phase 4 �?HTML/SVG report, install package & de-identified example

- Standalone SVG report: `render --format svg` (engine `renderSvgReport`) emits a self-contained
  SVG summary card �?no script, no external resource (only the XML namespace URI), every value
  escaped; it carries normalized time, BaZi four pillars + luck cycle, Zi Wei twelve palaces,
  warnings, provenance and the disclaimer. This is the handoff §7.2 fallback for hosts that cannot
  preview full HTML. Acceptance tests in `packages/orchestrator/test/render.test.ts`.
- Install package: `tools/package-skill.ts` (`pnpm run package`) stages a clean Skill copy into
  `dist/`, writes a SHA-256 manifest and a dependency-free ZIP (CRC32 + DEFLATE, fixed timestamp for
  byte-reproducibility), then re-parses and fully decompresses every entry to self-verify the
  archive round-trips. Also extractable by standard tools (verified with `Expand-Archive`).
- De-identified end-to-end example: `tools/gen-example.ts` (`pnpm run example`) runs the published
  bundle from a fictional birth record and writes
  `examples/{birth-input.json,chart.json,interpretation.json,synastry.json}` — deterministic and
  safe to commit. The HTML/SVG renderer remains paused and writes no example artifacts.
- Privacy remediation + guard: removed stray real-looking birth data (`scripts/birth-input.json`,
  `scripts/chart.json`, `.tmp/`) from the Skill source, and added a `validate:skill` check that
  `scripts/` holds only `loom-chart.mjs`, `fixtures/`, `dist/` (handoff §10); the enforced check
  count lives in the "Commands & results" table below.
- Remaining Phase 4 step: **live WorkBuddy upload/enable/trigger acceptance on a real device**
  (checklist in `docs/WORKBUDDY.md`); it cannot be exercised from the dev workspace.

### Phase W1 �?Western astrology (astronomy-engine provider)

- Western natal chart implemented on **astronomy-engine 2.1.19 (MIT, VSOP87 + NOVAS)**: Sun–Pluto plus
  the mean lunar nodes, with houses (placidus/whole-sign/equal/koch/porphyry), ascendant/MC,
  aspects, retrogrades and essential dignities. A real `WesternChartResult` schema
  (`packages/contracts/src/western.ts`) replaces the placeholder; the provider hides
  astronomy-engine types behind the contract.
- **ADR 0003 gate now PASSES for all ten bodies** including Mercury and Pluto �?the 2 `it.fails`
  are retired and replaced by 7 passing regression tests plus 4 independent equinox/solstice
  golden anchors. celestine (which failed ~17�?~37�? is removed; astronomy-engine moved to a
  bundled runtime dependency (SBOM now 6 components).
- Angles validated against independent oracles: the MC's right ascension equals RAMC, and the
  computed Ascendant sits on the eastern horizon per astronomy-engine's `Horizon`. Quadrant
  house systems FAIL at high latitude (`HOUSE_SYSTEM_UNAVAILABLE`) instead of silently switching.
- Honest degradation preserved: unknown birth time still places planets by date but fabricates no
  ascendant/houses; sidereal zodiac and the true node emit explicit warnings; `compare` with the
  `whole-sign` profile now yields genuinely different houses.
- HTML + SVG reports render the Western chart; forward-test covers both the computed path and the
  unknown-time no-houses path.

### Phase W2 �?Zi Wei dynamic charts (运限�?

- Zi Wei dynamic charts via iztro's `horoscope()`: **大限/小限/流年/流月/流日/流时** for any target
  solar date, each with its re-placed twelve palaces, 运限四化 and (流年) 将前/岁前十二�?
- New `horoscope` CLI subcommand (`--at YYYY-MM-DD[THH:mm[:ss]]`); `render` renders a horoscope
  output into HTML/SVG as well. The natal chart now records each palace's 三方四正 (对宫/财帛/官禄).
- Contracts: `ZiweiHoroscope` + `ZiweiHoroscopeResult`; `computeZiweiHoroscope` reuses the same
  natal astrolabe (needs a known time + gender rule, else ZIWEI_INPUT_REQUIRED, never fabricated).
- Verified against known anchors: 2026 = 丙午 流年, 小限虚岁 regression, monthly-branch regression,
  运限四化 contents, and 命宫 三方四正 (迁移/财帛/官禄). Byte-identical determinism; horoscope
  rendered to self-contained HTML in the clean-dir forward test.

### Phase W3 �?sourced BaZi interpretation rules (旺衰/格局/喜用�?十神)

- New `packages/bazi-rules`: deterministic, offline interpretation over a computed
  `BaziChartResult`. Every finding carries a public-domain classic citation (work + chapter) and a
  `matched` flag �?**no unsourced "single answer"**; where a rule cannot decide (建禄/月劫, a
  balanced day master) it says so instead of guessing.
- Rules: 旺衰 strength (得令/得地/得势, 《子平真诠�?, 格局 pattern from 月令本气 ten-god
  (《子平真诠�?, 喜用�?direction via 扶抑 (《滴天髓�?, 十神象义 (《渊海子平�?. Versioned ruleset
  `bazi-rules-ziping@0.1.0` (provider `bazi-rules`, MIT).
- Kept OUT of the calculation bundle: interpretation is a separate layer (handoff §8) that reads
  chart facts and never recomputes. The classics are recorded as public-domain in LICENSE_AUDIT.
- Verified on synthetic + real charts: 甲木卯月 �?偏强 with 建禄/月劫 honestly flagged; 正官�? matched; 身弱 �?喜印比劫; the chart's ten-gods listed. Deterministic.

### Phase W4 �?cross-system interpretation facts + host-LLM output

- New `packages/interpret` + an `interpret` CLI subcommand: aggregates the three charts (and an
  optional Zi Wei 流年) plus the sourced BaZi rules into topic-organized `InterpretationFacts`
  (性格/事业/财运/婚姻/学业/健康提示). Every fact carries machine-checkable `evidence` (ref + note)
  and an honest `caveat` �?no prose, no prediction, no invented values.
- The host LLM narrates ONLY from `interpretation.json` (guardrails in SKILL.md): cite evidence,
  surface caveats, honor disclaimers, never deterministic medical/legal/financial/life-and-death
  advice. De-identified �?no name/life events, and free-text location never leaks into the facts.
- Honest degradation preserved: unknown time �?no ascendant/MC claim; unspecified gender �?no
  spouse-star fabrication. Deterministic byte-identical output.

### Phase W5 �?吉凶 facts, sidereal/true-node/asteroids, render paused (ADR 0005)

- **日柱十神显示 fixed:** `BaziPillar.tenGodDisplay` (day column = 日主(日元), never blank);
  `tenGod` stays `null` on the day pillar for backward compatibility.
- **吉凶 productized (sourced facts + host narration):** new `bazi-rules` modules `relations.ts`
  (刑冲合害), `shensha.ts` (神煞), `fortune.ts` (大运/流年 生克吉凶); `strength`/`useful-god`
  gained reason chains. `BaziRuleFinding`/`InterpretationFact` carry `polarity` (�?�?中�? +
  `reason`; `interpret` adds `followupOffers` (事业/感情/财运/学业/流年).
- **Western completeness (MIT, self-computed):** sidereal zodiac (Lahiri ayanamsha), true lunar
  node, and asteroids (Chiron/Ceres/Pallas/Juno/Vesta). The ten planets keep the �?�?gate two ways �?wrapper-consistency (vs astronomy-engine) plus an independent JPL Horizons golden (`packages/western/goldens/jpl-horizons.json`, worst 0.20�?
  (`precision: high`); the true node + asteroids are `precision: approximate` and excluded from it.
- **Cross-model consistency:** SKILL.md mandates `calculate --systems all` (full COMPUTATION; how much
  is DISPLAYED follows the output channel �?Channel A full three charts, Channel B topic-only) + a closing
  follow-up offer; `references/reading-style.md` fixes the narration order.
- **HTML/SVG report paused:** `render` returns a disabled notice (exit 3); renderer + template stay
  dormant. Tools (`smoke`/`forward-test`/`gen-example`) updated accordingly.
- **取格修正 + 应期 + 解读严谨 (ADR 0006):** 建禄仅禄�?阳刃仅刃位；杂气月透干取格（戊土辰月→杂气
  正财格，非建禄）；新增五行缺失、天干五�?日主合财)、大�?流年冲合应期(�?2028 申冲�?�? reading-style/SKILL 增反绝对化与术语/系统隔离/一致性铁律�?- **逐年流年 + 语义精修 (ADR 0007):** 引擎按当前年锚定逐年产出流年主题(天干/地支十神+合冲)；日�? 多重合合并为一�?贴身/遥见、不双合�?；缺 X 改述为“需后天训练、非无能力”；概率话术改为趋势�? reading-style/SKILL 增十神象�?财格/官杀藏≠排斥组织/紫微忌单�?水逆≠�?校对敏感项�?- **常见追问 + 多人合婚 (ADR 0008):** 新增婚姻/正缘应期、适合行业、配偶画像事�?+ 追问 playbook；新�? `@loom/synastry` 包与 `synastry` 命令�?-5 人、八�?紫微/占星三系�?2 人需 analyzePair）；SKILL
  多人工作流（先确认关系与分析哪两人）；反绝对化——不作“注�?必分”。W5 “synastry 不做”假设作废�?

## Commands & results (2026-07-26)

The counts below are the output of one real `pnpm run test` run �?the single source of truth
shared with [VALIDATION.md](./VALIDATION.md) ("Current results"). `pnpm run check:doc-counts` fails
if either doc's `N tests / M files` count drifts from an actual run, so update both from the run,
never by hand.

| Command                        | Result                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run typecheck`           | clean (tsc strict over packages, tools, tests)                                                                                                                                                                                                                                                                                             |
| `pnpm run test`                | 1112 tests / 80 files �?all passing (all systems + JPL Horizons 独立 golden + interpret + 吉凶 + 合婚 + reading-lint/空话/重复/越界 + validate-answer v2 结构与措辞门禁（约束引用事实豁免+全可见文本安全扫�?资源上限+有界解析入口，非语义正确性证明） + western-rules/ziwei-rules 语义规则 + 版本迁移/回滚/目标白名�?+ PII 隐私护栏 green) |
| `pnpm run build`               | `engine.mjs` �?3.1 MB + `sbom.cdx.json` + `sbom.spdx.json` (11 runtime deps)                                                                                                                                                                                                                                                               |
| `pnpm run validate:skill`      | 40 / 40 (incl. scripts/ no-stray-files guard + CycloneDX/SPDX SBOM checks + validate-answer/lint-reading gate-workflow doc checks)                                                                                                                                                                                                         |
| `pnpm run validate:reading`    | 36 / 36 (topic example libraries + output-spec structure + natural-delivery boundary; offline, no LLM)                                                                                                                                                                                                                                     |
| `pnpm run validate:docs`       | passes (docs consistency: 4 full hosts, render disabled, no wrong-ephemeris attribution, dev Node 24 / run Node 22; self-tests)                                                                                                                                                                                                            |
| `pnpm run validate:provenance` | passes (no wrong-ephemeris attribution in live source / examples / built engine; VSOP87+NOVAS; self-tests)                                                                                                                                                                                                                                 |
| `pnpm run verify:hosts`        | real candidate ZIPs: single top dir, no double-nest, doctor/verify/calculate byte-identical to canonical                                                                                                                                                                                                                                   |
| `pnpm run verify:install`      | root publishes GitHub Release v0.4.0 with immutable URL/SHA-256; next candidate build remains unpublished/reproducible                                                                                                                                                                                                                     |
| `pnpm run smoke`               | 10 / 10 (offline; source CLI vs isolated Skill byte-identical)                                                                                                                                                                                                                                                                             |
| `pnpm run forward:test`        | 41 / 41 (offline; 8 realistic requests incl. horoscope + interpret + synastry)                                                                                                                                                                                                                                                             |
| `pnpm run example`             | regenerates `examples/` (de-identified artifacts; needs build)                                                                                                                                                                                                                                                                             |
| `pnpm run package`             | `dist/` stage + self-verified `.zip` + `.sha256` (21 files; needs build)                                                                                                                                                                                                                                                                   |
| `pnpm run check:doc-counts`    | passes �?both docs match the real run                                                                                                                                                                                                                                                                                                      |
| `pnpm run scan:licenses`       | offline license-policy gate (LICENSE_AUDIT allowlist) + SBOM license cross-check; fail-closed                                                                                                                                                                                                                                              |
| `pnpm run format:check`        | clean                                                                                                                                                                                                                                                                                                                                      |
| `pnpm run verify:cloud`        | CI-safe, non-sensitive gate; must pass in GitHub Actions                                                                                                                                                                                                                                                                                   |
| `pnpm run verify:all`          | controlled local gate; `scan:incident` fails closed when its private token file is unavailable                                                                                                                                                                                                                                             |

Vertical slice proven: `birth-input.json �?normalize �?ChartBundle �?structured JSON` (render paused),
runnable from a clean copy outside the repo, offline, deterministic.

## Deferred / not yet implemented

- Richer Western minor aspects and extra dignity readings �?later slices (the sidereal zodiac, true
  lunar node and asteroids are already computed as `precision: approximate`).
- Richer interpretation (调�? more 格局 branches, Western dignities/aspects readings) �?future
  ruleset versions; the current layer is the deterministic substrate for the host LLM.
- Dependency **vulnerability** scan (`scan:deps`), **license** scan (`scan:licenses`) and **secret**
  scan (`scan:secrets`) are wired into `verify:cloud` (and therefore `verify:all`); `build` emits both a
  CycloneDX and an SPDX 2.3 SBOM. A broader lint ruleset is still deferred (the ESLint
  import-boundary gate is already enforced).
- Live WorkBuddy upload/enable/trigger acceptance �?the remaining Phase 4 step (real device;
  checklist in `docs/WORKBUDDY.md`).

## Open risks

- Western angles/houses are derived in-house (not astronomy-engine); they are validated against
  the MC=RAMC and eastern-horizon oracles and an independent Swiss Ephemeris house golden
  (swetest 2.10.03, 5 synthetic cases x 5 systems, 12 cusps + angles each, worst measured
  deviation 0.69 arc-minutes; see packages/western/goldens/README.md). The golden covers
  normal latitudes; circumpolar instants are contract-tested (HOUSE_SYSTEM_UNAVAILABLE).
- LMT-era (early 1901+) offsets are whole-minute precision (moment-timezone limitation).
- Equation of time is an approximation (~tenths of a minute); fine for display, not high-precision.
- TypeScript pinned to 5.9 while registry `latest` is 7.0; revisit after TS 7 soaks.

## Owner decisions pending (do not block Phase 2)

1. License route (default: closed-source-friendly MIT/BSD/Apache).
2. Interpretation product route (default: calculate first, interpret later).

## Next step (expansion roadmap complete �?Phase 4 acceptance / Phase 5�?)

The approved expansion roadmap is now **complete**: Western natal charts (astronomy-engine, VSOP87 + NOVAS),
Zi Wei dynamic charts (运限�?, a sourced BaZi interpretation-rules package, and the cross-system
interpretation-facts layer that a host LLM turns into natural-language readings (婚姻/财运/事业/
学业) are all implemented, tested and gated green. Remaining work: (1) the live WorkBuddy
upload/enable/trigger acceptance on a real device (checklist in `docs/WORKBUDDY.md`, the only
Phase 4 item that cannot run from the dev workspace); (2) optional Phase 5 (MCP/Web/API layer or a
separate `interpret-birth-charts` Skill); (3) remaining Phase 6 hardening (a broader lint ruleset;
the dependency vulnerability scan, license scan, secret scan, ESLint import-boundary gate and
dual CycloneDX/SPDX SBOMs are already in place).
