/**
 * Vacilando — Shared Understanding surface (Product Realization V1, Phase 2).
 *
 * Makes the *reliance surface* legible in the Director workspace: what the work
 * currently RESTS ON, what remains OPEN, what we are knowingly CARRYING, and WHY
 * — without the operator reconstructing it from packages, gap reports, prior
 * missions, or transcripts.
 *
 * This is a PROJECTION over durable product state, not a new store and not a
 * generated narrative. One primitive — the claim — typed by epistemic status ×
 * authorship (per SHARED-UNDERSTANDING-MODEL.md). Deliberately incomplete: only
 * load-bearing / relied-upon claims and the honest frontier earn a place;
 * superseded claims are demoted to history, never shown active.
 *
 * Single source of truth with Phase-1 counsel: the frontier and the continuation
 * basis are computed by the SAME functions the closing counsel uses
 * (selectFrontier / frontierPhrase / attemptCounsel), so the visible surface can
 * never contradict what Director says.
 *
 * Durable, not ephemeral: every field derives from the Product Definition, the
 * Capability, the compiled Package, and the mission store — all JSONL-backed and
 * surviving a provider change, a new conversation, or a server restart. No field
 * is reconstructed from the current chat transcript.
 */
import { selectFrontier, frontierPhrase, attemptCounsel } from "./counsel.mjs";

const MONEY_RE = /financ|ledger|money|balance|payment|invoice|billing/i;
const MAX_RELIED = 6; // curation cap — historical volume must not become visual volume

/**
 * Build the curated reliance surface for a conversation from durable state.
 * Returns null only when there is no mission. Fields are always present (arrays
 * may be empty) so the renderer can stay declarative.
 */
export function composeUnderstanding({ mission, capability, package: pkg, capabilityMissions, capName }) {
  const name = capName || capability?.name || "this capability";
  const pd = capability?.product_definition || null;
  const V = pkg?.readiness_verdict || null;
  const ready = V?.verdict === "Ready";

  // ---- Intent — the anchor (operator-authored), concise and path-free. ----
  const intent = conciseIntent(mission?.intent || mission?.objective || "", name, `${mission?.title || ""} ${mission?.objective || ""}`);

  // ---- Relied upon — the curated, load-bearing claims the work rests on. ----
  // Decisions (operator or settled), then HARD constraints, then endorsed
  // patterns. Each carries its own voice (authorship) and its why (rationale).
  const relied = [];
  for (const d of (pd?.accepted_decisions || [])) {
    if (isSuperseded(pd, d)) continue; // a later decision replaced this — demoted to history
    relied.push({
      text: d.statement,
      kind: "decision",
      voice: d.provenance === "operator" ? "You decided" : "Settled",
      settled_from_prior: d.provenance !== "operator",
      why: d.rationale || null,
    });
  }
  for (const c of (pd?.constraints || [])) {
    relied.push({ text: c.statement, kind: "constraint", voice: c.hard ? "Must" : "Prefer", why: null, hard: !!c.hard });
  }
  for (const p of (pd?.patterns || []).filter((x) => x.status === "endorsed")) {
    relied.push({ text: p.statement, kind: "pattern", voice: "Approach", why: null });
  }
  // Curate: decisions + hard constraints are always load-bearing; soft/pattern
  // claims fill remaining room only. Historical volume must not create volume.
  const loadBearing = relied.filter((r) => r.kind === "decision" || r.hard);
  const relied_upon = (loadBearing.length >= MAX_RELIED ? loadBearing : relied).slice(0, MAX_RELIED);

  // ---- Frontier — what remains open (SAME source as Phase-1 counsel). ----
  const frontier = [];
  if (!ready && V) {
    // A blocking verdict IS the frontier: name what it needs, honestly.
    frontier.push({ question: V.what_to_do || `Decide what shapes ${name}.`, why: V.why || null, blocks_execution: true });
  } else {
    for (const item of selectFrontier(pkg?.gap_report)) {
      const p = frontierPhrase(item, { capName: name });
      if (p) frontier.push({ question: p.need, why: cleanWhy(p.line), blocks_execution: !!item.blocking });
    }
  }

  // ---- Knowingly carrying — accepted imperfections, tradeoffs, open risks. ----
  // Consciously accepted uncertainty must be visible without becoming a warning
  // dashboard: a small, honest list, only when present.
  const carrying = [];
  for (const t of (pd?.known_tradeoffs || [])) {
    carrying.push({ text: `${t.chose} over ${t.over}`, kind: "tradeoff", why: t.because || null });
  }
  for (const k of (capability?.known_issues || []).filter((x) => x.status === "open")) {
    carrying.push({ text: k.issue, kind: "accepted_imperfection", why: null });
  }
  if (MONEY_RE.test(`${capability?.name || ""} ${capability?.description || ""}`) && ready && (V?.confidence ?? 1) < 0.8) {
    carrying.push({ text: "This touches the ledger and rests on thin support — worth firming before acting.", kind: "risk", why: null });
  }

  // ---- Director advises — recommendations NOT yet decided (kept distinct). ----
  // Curated to a headline, never a checklist; the operator turns advice into a
  // decision only through the conversation, never here.
  const suggested = (pkg?.suggested_acceptance_criteria || []);
  const advises = suggested.length
    ? { headline: `${suggested.length} acceptance ${suggested.length === 1 ? "criterion" : "criteria"} to confirm`, count: suggested.length }
    : null;

  // ---- Set aside — superseded / rejected directions (history, not active). ----
  const set_aside = [];
  for (const rp of (pd?.rejected_patterns || [])) {
    set_aside.push({ text: rp.statement, revisit_if: rp.revisit_if && rp.revisit_if !== "never" ? rp.revisit_if : null });
  }
  for (const d of (pd?.accepted_decisions || [])) {
    if (isSuperseded(pd, d)) set_aside.push({ text: d.statement, revisit_if: null });
  }

  // ---- Basis — continuation provenance from real attempt history. ----
  const attempt = attemptCounsel(capabilityMissions || [], mission?.mission_id, name);
  const basis = attempt ? { continuation: attempt.rec, position: attempt.position } : null;

  const nothing_settled = relied_upon.length === 0;
  const is_thin = ready && (V?.confidence ?? 1) < 0.8;

  return {
    schema_version: "vacilando.understanding.v1",
    intent,
    relied_upon,
    frontier,
    carrying,
    advises,
    set_aside,
    basis,
    nothing_settled,
    is_thin,
  };
}

/**
 * A concise, path-free intent line. The operator's own short intent is used
 * verbatim; a verbose compiled objective (which can carry code paths) is reduced
 * to the capability and its version framing rather than leaked raw.
 */
function conciseIntent(raw, capName, corpus) {
  const t = String(raw || "").trim();
  const looksClean = t && t.length <= 90 && !/[/\\]|\.(tsx|mjs|md|ts|js)\b/i.test(t);
  if (looksClean) return t;
  return /\bv2\b|proposal/i.test(corpus || t) ? `${capName} — V2 proposal` : (capName || t);
}

/** A decision is superseded when a LATER decision declares `supersedes` == its id. */
function isSuperseded(pd, decision) {
  return (pd?.accepted_decisions || []).some((d) => d.supersedes && d.supersedes === decision.id);
}

/** Strip the conversational lead-in so a frontier "why" reads as state, not speech. */
function cleanWhy(line) {
  if (!line) return null;
  let t = String(line).trim();
  // Take the consequence clause if the phrase carries one ("… — it changes …").
  const dash = t.indexOf(" — ");
  if (dash > 0 && dash < t.length - 3) t = t.slice(dash + 3);
  t = t.replace(/^(are we|so are we|there's|it)\b/i, (m) => m).trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
