/**
 * Vacilando — Director Counsel (Product Realization V1, Phase 1).
 *
 * Turns signals the product ALREADY computes into engineering COUNSEL, so
 * Director stops narrating orchestration mechanics and starts advising:
 *
 *   1. Confidence-qualified readiness — a positive verdict speaks differently at
 *      0.2 than at 1.0 (uses `readiness_verdict.confidence`).
 *   2. Attempt-history counsel — continue-vs-restart from the REAL mission
 *      history for a capability, not a static seed count.
 *   3. Frontier surfacing — the one unresolved question that actually bears on
 *      proceeding (from the embedded `gap_report.findings`), not every gap.
 *
 * Pure and deterministic: (verdict, gapReport, capabilityMissions, capability)
 * → text. No new store, no new signal, no provider, no new architecture. The
 * three behaviours COMPOSE into one coherent Director line, and none of the
 * internal vocabulary (confidence, frontier, tier, signal, move) ever reaches
 * the operator. Silence is preferred to an invented caution or frontier.
 */

// Confidence bands. A "Ready" verdict is honest about the strength beneath it.
const STRONG_MIN = 0.8;   // evidence, prior work, and definition line up
const VERY_THIN_MAX = 0.3; // resting on almost nothing

// Mission lifecycle → attempt outcome buckets (mirrors the mission store).
const ACCEPTED = new Set(["completed"]);
const IN_FLIGHT = new Set(["waiting_for_operator", "running", "starting", "stopping", "interrupted", "blocked"]);
const FAILED = new Set(["failed"]);

const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const numWord = (n) => (n >= 0 && n <= 10 ? NUM[n] : String(n));
const lowerFirst = (s) => { const t = String(s || ""); return t ? t[0].toLowerCase() + t.slice(1) : t; };
function joinList(parts) {
  const p = parts.filter(Boolean);
  if (p.length <= 1) return p.join("");
  if (p.length === 2) return `${p[0]} and ${p[1]}`;
  return `${p.slice(0, -1).join(", ")}, and ${p[p.length - 1]}`;
}

/**
 * FRONTIER — select the unresolved claims that materially affect whether/how to
 * proceed. This is a SELECTION, not an enumeration: the systemic
 * "no architecture on disk" warning (present on every capability) and low-risk
 * known-issue scope questions are demoted, because treating them as blockers
 * manufactures a frontier where none exists.
 */
export function selectFrontier(gapReport) {
  const f = gapReport?.findings || {};
  const items = [];
  for (const mi of f.missing_information || []) {
    // Only a genuinely BLOCKING gap is a frontier. `warn`-severity notes (e.g.
    // the architecture reference that resolves nowhere on this local worktree)
    // are environmental, not decisions the operator must make.
    if (mi.severity === "block") items.push({ rank: 0, kind: "missing", id: mi.id, text: mi.what });
  }
  for (const c of f.conflicts || []) items.push({ rank: 1, kind: "conflict", id: c.id, text: c.detail });
  for (const u of f.unknowns || []) {
    // Known-issue scope questions are accepted, low-risk imperfections — not the
    // frontier. A load-bearing product question (maturity/version, goal delivery)
    // survives.
    if (String(u.id).startsWith("u_ki_")) continue;
    items.push({ rank: u.blocking ? 0 : 2, kind: "unknown", id: u.id, text: u.question, blocking: !!u.blocking });
  }
  items.sort((a, b) => a.rank - b.rank);
  return items;
}

/** Turn one frontier finding into clean operator prose (machinery stripped). */
export function frontierPhrase(item, ctx = {}) {
  if (!item) return null;
  const capName = ctx.capName || "this";
  if (item.id === "u_maturity") {
    return {
      need: "Confirm whether this extends existing work or is the first version.",
      line: "there's no earlier version on record, so are we extending something, or building the first real version? It changes what the mission is — it won't block a first pass, but it's worth a beat.",
    };
  }
  if (String(item.id).startsWith("u_goal_")) {
    return {
      need: item.text,
      line: `how ${capName} actually delivers that goal isn't settled yet — worth pinning down before we lean on it.`,
    };
  }
  if (item.kind === "conflict") {
    return {
      need: item.text,
      line: "this overlaps an approach that was deliberately set aside before — worth a human call before it goes further.",
    };
  }
  // Generic, de-jargoned fallback for any future deterministic finding.
  const clean = String(item.text || "").replace(/^Intent\b/i, "the ask").trim();
  return { need: item.text, line: lowerFirst(clean) };
}

/**
 * ATTEMPT-HISTORY COUNSEL — interpret the real prior attempts for a capability
 * (not a static count), and name the meaningful continue-vs-restart position.
 * `capabilityMissions` is every mission on the capability (including current);
 * `currentId` is excluded so Director speaks about the work BEHIND this one.
 */
export function attemptCounsel(capabilityMissions, currentId, capName) {
  const priors = (capabilityMissions || []).filter((m) => m.mission_id !== currentId);
  const n = priors.length;
  if (n === 0) return null; // genuinely new work — nothing to recall

  const accepted = priors.filter((m) => ACCEPTED.has(m.status)).length;
  const inflight = priors.filter((m) => IN_FLIGHT.has(m.status)).length;
  const failed = priors.filter((m) => FAILED.has(m.status)).length;

  // Interpreted recount — never a chronology dump; only the outcomes that matter.
  const parts = [];
  if (accepted) parts.push(`${accepted === 1 ? "one" : numWord(accepted)} already reached a completed proposal`);
  if (inflight) parts.push(`${inflight === 1 ? "one is" : `${numWord(inflight)} are`} still in progress`);
  if (failed) parts.push(`${failed === 1 ? "one" : numWord(failed)} didn't finish cleanly`);

  let recount;
  if (n === 1) {
    recount = accepted ? "There's one earlier attempt here, and it already reached a completed proposal."
      : inflight ? "There's already an attempt in progress on this."
      : failed ? "There's one earlier attempt, and it didn't finish cleanly."
      : "There's one earlier attempt on record here.";
  } else {
    recount = `There are ${numWord(n)} earlier attempts on ${capName}${parts.length ? ` — ${joinList(parts)}` : ""}.`;
  }

  // The recommendation: highest-value continuation first.
  let position, rec;
  if (inflight) { position = "continue"; rec = "Rather than open another, I'd pick up the one that's still in progress."; }
  else if (accepted) { position = "build_on"; rec = "Rather than start fresh, I'd continue the completed one — restarting risks re-solving what's already settled."; }
  else if (failed) { position = "resume_caution"; rec = "Before retrying, it's worth a look at why the last one didn't land, so we don't repeat it."; }
  else { position = "consolidate"; rec = `Better to continue one of those than add another.`; }

  return { n, accepted, inflight, failed, position, recount, rec };
}

/**
 * CONFIDENCE-QUALIFIED READINESS — distinguish strongly supported / supported
 * with qualifications / possible-but-weak / not-honestly-ready. Explains the
 * basis; never exposes the score.
 */
export function readinessCounsel({ verdict, confidence, hasFrontier, moneyTouching }) {
  const V = verdict;
  if (!V || V.verdict !== "Ready") {
    // Not honestly ready — a load-bearing gap remains. Keep the honest send-back
    // language the product already computes (this is the working control case).
    const line = [V?.why, V?.what_to_do].filter(Boolean).join(" ").trim();
    return { tier: "not_ready", line };
  }
  const c = typeof confidence === "number" ? confidence : null;

  // Supported WITH QUALIFICATIONS — a named open question qualifies an otherwise
  // reasonable readiness. The frontier clause is appended by the composer.
  if (hasFrontier) return { tier: "qualified", line: "This is reasonable to take forward," };

  // Strongly supported — say so plainly; do NOT invent caution.
  if (c != null && c >= STRONG_MIN) {
    return { tier: "strong", line: "The evidence and prior work line up well — I'd go ahead." };
  }

  // Possible but weakly supported — technically executable, weak engineering basis.
  if (c != null && c < VERY_THIN_MAX) {
    return { tier: "weak", line: "I can pull a package together, but honestly it's resting on very little — barely any prior art or references. Proceeding is a judgment call more than a sure thing." };
  }
  const stakes = moneyTouching ? " And for something that touches the ledger, I'd want it firmer before we act." : "";
  return { tier: "weak", line: `This is ready to look at, but it's built on a thin basis — enough to compile, not enough to be thorough.${stakes}` };
}

const MONEY_RE = /financ|ledger|money|balance|payment|invoice|billing/i;

/**
 * Compose the three behaviours into ONE coherent Director counsel for a
 * conversation's resting state. Returns:
 *   { tier, reviewedLine, closing, needs, frontier[], attempt } | closing:null
 * `closing` is null when there is no verdict yet (nothing to counsel — Director
 * is still preparing); the caller falls back to its "preparing" line.
 */
export function composeCounsel({ mission, capability, package: pkg, capabilityMissions, capName }) {
  const name = capName || capability?.name || "this";
  const V = pkg?.readiness_verdict || null;
  const gap = pkg?.gap_report || null;

  const frontier = selectFrontier(gap);
  const top = frontier[0] || null;
  const topPhrase = top ? frontierPhrase(top, { capName: name }) : null;
  const moneyTouching = MONEY_RE.test(`${capability?.name || ""} ${capability?.description || ""}`);

  const readiness = readinessCounsel({ verdict: V, confidence: V?.confidence, hasFrontier: !!top, moneyTouching });
  const attempt = attemptCounsel(capabilityMissions || [], mission?.mission_id, name);

  // ---- closing line: continuation rec (if load-bearing) → readiness → frontier ----
  // The frontier composes ONLY into the "qualified" branch; any load-bearing
  // frontier forces the qualified tier, so a "strong"/"weak" Ready never carries
  // an open question, and a not-ready verdict's send-back stands on its own
  // (no trailing frontier clause).
  let closing = null;
  if (V) {
    const parts = [];
    if (attempt && (attempt.position === "continue" || attempt.position === "build_on")) parts.push(attempt.rec);
    if (readiness.tier === "qualified" && topPhrase) {
      parts.push(`${readiness.line} but one thing's worth settling first: ${topPhrase.line}`);
    } else if (readiness.line) {
      parts.push(readiness.line);
    }
    closing = parts.filter(Boolean).join(" ").trim() || null;
  }

  // ---- "What Director still needs" ----
  let needs;
  if (readiness.tier === "not_ready") {
    needs = [V?.what_to_do, ...(V?.reasons || [])].filter(Boolean);
  } else {
    needs = frontier.map((it) => frontierPhrase(it, { capName: name })?.need).filter(Boolean);
  }

  return {
    schema_version: "vacilando.counsel.v1",
    tier: readiness.tier,
    reviewedLine: attempt?.recount || null,
    closing,
    needs,
    frontier: topPhrase ? [{ id: top.id, need: topPhrase.need }] : [],
    attempt: attempt ? { position: attempt.position, n: attempt.n } : null,
  };
}
