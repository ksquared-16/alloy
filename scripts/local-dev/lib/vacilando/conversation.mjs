/**
 * Vacilando — Director Conversations V1.
 *
 * A conversation is not a new record — it is the mission, RE-TOLD as a dialogue.
 * The transcript is ASSEMBLED deterministically from durable facts already on
 * disk (the mission, its product decisions, its package versions, the verdict,
 * the lifecycle) — no separate chat store, so a conversation is reproducible and
 * always in sync with reality. Director "speaks" by narrating those facts in
 * natural language; the operator "speaks" through the decisions they record.
 *
 * The operator should feel they are collaborating with Director about a piece of
 * work — never managing mission records.
 */
import { getMission, readMissions } from "./commands/missions.mjs";
import { getPackage, packageLineage, packageForMission } from "./commands/mission-packages.mjs";
import { getCapability } from "./capability.mjs";
import { getProductDefinitionForCapability } from "./product-definition.mjs";
import { readAcceptance } from "./acceptance.mjs";
import { composeCounsel } from "./counsel.mjs";
import { composeUnderstanding } from "./shared-understanding.mjs";
import { composeOperations, stateKeyFor, STATES, conversationStage } from "./operations.mjs";
import { composePresence } from "./presence.mjs";

const firstSentence = (s) => { const t = String(s || "").trim(); const i = t.search(/[.!?]/); return i > 0 ? t.slice(0, i) : t; };
const time = (x) => (x ? new Date(x).getTime() : 0);

/** A natural title for the conversation — the capability, not "… V2 — Proposal". */
function conversationTitle(m, cap) {
  if (cap?.name) return cap.name;
  return String(m.title || "").replace(/\s*V\d+\b.*$/i, "").trim() || "Untitled";
}

// The operator-facing verb for each engineering state (one word, the next move).
const STATE_ACTION = {
  preparing: "Open", ready: "Start", executing: "Open", waiting: "Open",
  needs_operator: "Continue", blocked: "Continue", verifying: "Open",
  review: "Review", accepted: "Open", closed: "Open", at_risk: "Continue",
};

/**
 * What engineering state this work is in — the SINGLE state vocabulary shared by
 * the inbox, the header, and the operational band (Engineering Operations Center,
 * Part III). A blocking verdict (Needs Product Decisions) still shows its own
 * label so the send-back reads honestly.
 */
const STAGE_INBOX = {
  understanding: { label: "Understanding", tone: "run", action: "Answer" },
  preparing: { label: "Ready to start", tone: "ok", action: "Review" },
};
export function conversationState(m, pkg) {
  // Pre-start, the conversation is in a STAGE (Understanding until Director's
  // questions are answered, then Preparing). The inbox names the stage honestly.
  if (!["completed", "closed", "failed", "interrupted", "starting", "running", "stopping", "waiting_for_operator", "waiting_for_acceptance", "blocked"].includes(m.status)) {
    const stage = conversationStage(m, pkg);
    if (STAGE_INBOX[stage]) return { ...STAGE_INBOX[stage], key: stage === "understanding" ? "preparing" : "ready" };
  }
  const key = stateKeyFor(m, pkg);
  const st = STATES[key];
  return { label: st.label, tone: st.tone, action: STATE_ACTION[key] || "Open", key };
}

/**
 * Assemble the full conversation for a mission. Returns null if unknown.
 */
export function assembleConversation(mission_id) {
  const m = getMission(mission_id);
  if (!m) return null;
  const cap = m.capability_id ? getCapability(m.capability_id) : null;
  const pkg = m.package_id ? getPackage(m.package_id) : packageForMission(mission_id);
  const pd = m.capability_id ? getProductDefinitionForCapability(m.capability_id) : null;
  const V = pkg?.readiness_verdict || null;
  const title = conversationTitle(m, cap);
  const intent = m.intent || m.objective || "";
  const lineage = pkg ? packageLineage(pkg.package_lineage_id || pkg.package_id) : [];

  // The REAL attempt history for this capability — every mission on it, not the
  // static seed count (which under-reported nine attempts as "1 past mission").
  const capabilityMissions = m.capability_id
    ? readMissions(null, 1000).filter((x) => x.capability_id === m.capability_id)
    : [];

  // Confidence-qualified counsel (readiness + attempt history + frontier),
  // composed from signals already computed and frozen on the package.
  const counsel = composeCounsel({ mission: m, capability: cap, package: pkg, capabilityMissions, capName: title });

  // The visible Shared Understanding — the curated reliance surface, projected
  // from the SAME durable state (one source of truth with the counsel above).
  const understanding = composeUnderstanding({ mission: m, capability: cap, package: pkg, capabilityMissions, capName: title });

  // The work-centric operational view — engineering state, progress, needs-you,
  // verification, and review — so the operator manages WORK, not the provider.
  const operations = composeOperations({ mission: m, package: pkg, acceptance: readAcceptance(mission_id) });

  // ---- narrative transcript (a story, from real facts) ----
  const opening = [];
  opening.push({ from: "you", kind: "intent", text: intent, at: m.created_at });
  if (cap) {
    const desc = cap.description && !/^defined from/i.test(cap.description) ? ` — ${firstSentence(cap.description).toLowerCase()}` : "";
    opening.push({ from: "director", kind: "found", text: `I found ${cap.name}${desc}.`, at: m.created_at });
  }
  if (counsel.reviewedLine) opening.push({ from: "director", kind: "reviewed", text: counsel.reviewedLine, at: m.created_at });

  // Time-ordered middle: package versions interleaved with the operator's decisions.
  const middle = [];
  for (const p of [...lineage].sort((a, b) => a.version - b.version)) {
    if (p.version === 1) middle.push({ from: "director", kind: "package", text: "I pulled together a first draft of the package.", at: p.created_at });
    else middle.push({ from: "director", kind: "package", text: `I updated the package${p.diff_from_previous?.verdict_change ? ` — ${p.diff_from_previous.verdict_change.toLowerCase()}` : ` (now v${p.version})`}.`, at: p.created_at || p.updated_at });
  }
  for (const d of (pd?.accepted_decisions || []).filter((x) => x.provenance === "operator" && time(x.decided_at) >= time(m.created_at))) {
    middle.push({ from: "you", kind: "decision", text: d.statement, at: d.decided_at });
  }
  middle.sort((a, b) => time(a.at) - time(b.at));

  // Director's PRESENCE — the single, event-driven voice for this stage (the closing
  // line). Derived from the same durable state; falls back to counsel at rest.
  const presence = composePresence({
    mission: m, stage: operations.stage, stateKey: operations.state?.key,
    questions: operations.questions, counsel, review: operations.review,
  });

  const closing = [{ from: "director", kind: "state", text: presence.line, at: m.updated_at }];
  const messages = [...opening, ...middle, ...closing];

  const st = conversationState(m, pkg);
  return {
    schema_version: "vacilando.conversation.v1",
    conversation_id: mission_id, mission_id, title, intent,
    state: st, verdict: V, capability_id: m.capability_id || null,
    messages, presence,
    understanding, operations,
    package: pkg || null, mission: m,
    acceptance: readAcceptance(mission_id),
  };
}

/** The conversation inbox — every real conversation, freshest first. */
export function listConversations() {
  return readMissions(null, 500)
    .filter((m) => m.capability_id)
    .map((m) => {
      const pkg = m.package_id ? getPackage(m.package_id) : null;
      const cap = m.capability_id ? getCapability(m.capability_id) : null;
      return {
        conversation_id: m.mission_id, title: conversationTitle(m, cap),
        intent: m.intent || m.objective || "", state: conversationState(m, pkg),
        updated_at: m.updated_at,
      };
    })
    .sort((a, b) => time(b.updated_at) - time(a.updated_at));
}
