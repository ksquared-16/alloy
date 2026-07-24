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

const firstSentence = (s) => { const t = String(s || "").trim(); const i = t.search(/[.!?]/); return i > 0 ? t.slice(0, i) : t; };
const time = (x) => (x ? new Date(x).getTime() : 0);

/** A natural title for the conversation — the capability, not "… V2 — Proposal". */
function conversationTitle(m, cap) {
  if (cap?.name) return cap.name;
  return String(m.title || "").replace(/\s*V\d+\b.*$/i, "").trim() || "Untitled";
}

/** What state is this conversation in, in the operator's words. */
export function conversationState(m, V) {
  if (m.status === "completed") return { label: "Accepted", tone: "ok", action: "Open" };
  if (["starting", "running", "stopping"].includes(m.status)) return { label: "Executing", tone: "run", action: "Open" };
  if (m.status === "waiting_for_operator") return { label: "Waiting on you", tone: "attn", action: "Continue" };
  if (m.status === "failed") return { label: "Needs another look", tone: "attn", action: "Continue" };
  if (V?.verdict === "Ready") return { label: "Ready for review", tone: "ok", action: "Review" };
  if (V?.verdict) return { label: V.verdict, tone: "attn", action: "Continue" };
  return { label: "Preparing…", tone: "muted", action: "Open" };
}

/** What Director says right now, given the verdict + lifecycle. */
function directorSays(V, m, title) {
  if (m.status === "completed") return "This work is done and accepted.";
  if (["starting", "running", "stopping"].includes(m.status)) return "This is executing now — I'll let you know when it needs you.";
  if (m.status === "waiting_for_operator") return "I'm waiting on your input to continue.";
  if (m.status === "failed") return "The last run didn't finish cleanly — let's take another look before sending it again.";
  if (V?.verdict === "Ready") return `Everything I need is in place. The package for ${title} is ready for your review.`;
  if (V) return `${V.why || "I need a little more before this is ready."} ${V.what_to_do || ""}`.trim();
  return `Let me pull together what I know about ${title}.`;
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
  const pastMissions = (cap?.mission_history || []).length;

  // ---- narrative transcript (a story, from real facts) ----
  const opening = [];
  opening.push({ from: "you", kind: "intent", text: intent, at: m.created_at });
  if (cap) {
    const desc = cap.description && !/^defined from/i.test(cap.description) ? ` — ${firstSentence(cap.description).toLowerCase()}` : "";
    opening.push({ from: "director", kind: "found", text: `I found ${cap.name}${desc}.`, at: m.created_at });
  }
  if (pastMissions) opening.push({ from: "director", kind: "reviewed", text: `I looked over previous work on this — ${pastMissions} past ${pastMissions === 1 ? "mission" : "missions"}.`, at: m.created_at });

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

  const closing = [{ from: "director", kind: "state", text: directorSays(V, m, title), at: m.updated_at }];
  const messages = [...opening, ...middle, ...closing];

  // ---- insights: what we're doing / what Director knows / still needs ----
  const refs = (pkg?.relevant_documents || []).length + (pkg?.approved_references || []).length;
  const knows = [
    cap ? `The capability: ${cap.name}` : null,
    (cap?.accepted_decisions || []).length ? `${(cap.accepted_decisions || []).length} product decision${(cap.accepted_decisions || []).length === 1 ? "" : "s"}` : null,
    pastMissions ? `${pastMissions} past mission${pastMissions === 1 ? "" : "s"}` : null,
    refs ? `${refs} reference${refs === 1 ? "" : "s"}` : null,
    pkg ? `A prepared package (v${pkg.version})` : null,
  ].filter(Boolean);
  const needs = V && V.verdict !== "Ready" ? [V.what_to_do, ...(V.reasons || [])].filter(Boolean) : [];

  const st = conversationState(m, V);
  return {
    schema_version: "vacilando.conversation.v1",
    conversation_id: mission_id, mission_id, title, intent,
    state: st, verdict: V, capability_id: m.capability_id || null,
    messages, insights: { goal: intent, knows, needs },
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
      const V = pkg?.readiness_verdict || null;
      return {
        conversation_id: m.mission_id, title: conversationTitle(m, cap),
        intent: m.intent || m.objective || "", state: conversationState(m, V),
        updated_at: m.updated_at,
      };
    })
    .sort((a, b) => time(b.updated_at) - time(a.updated_at));
}
