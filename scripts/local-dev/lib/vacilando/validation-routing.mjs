/**
 * Validation path convergence — one capacity authority, and one way in.
 *
 * TWO BYPASSES REMAINED AFTER S5. Heavy validation could still run outside
 * `vac run`, and `alloy-validate` kept its own capacity regime: a host-wide
 * mkdir mutex AND a counted heavy-job budget, neither of which knew anything
 * about S5's weighted tokens. Two budgets independently authorising the same
 * work is the original incident's shape, one layer up.
 *
 * THE INVARIANT THIS SLICE ESTABLISHES. Exactly one component may say YES to
 * expensive validation. Everything else may say NO, or may record. A refusal is
 * not an authorisation, so a memory-pressure guard or a browser-certification
 * lease can coexist with S5 — what cannot coexist is a second thing that grants.
 *
 * FALSE INTERCEPTION IS WORSE THAN A REPORTED BYPASS. A hook that rewrites a
 * command it misread breaks work that was correct. So routing fires only on a
 * classification the S3 classifier calls AUTHORITATIVE, on a segment that can be
 * reconstructed exactly. Anything else is allowed through and RECORDED, because
 * an honest "this escaped and here is what it was" is more useful than a guess
 * that silently changes what a test run does.
 *
 * WHAT ROUTING MAY CHANGE. Concurrency, through the existing S5 worker cap, and
 * nothing else. Not test selection, not correctness flags, not configuration,
 * not build semantics.
 */
import { classifyNormalized, normalizeInvocation, WORKLOAD_CLASSES } from "./workload-classification.mjs";
import { looksLikeValidation } from "./health-probes.mjs";

export const VALIDATION_ROUTING_SCHEMA = "vacilando.validation_routing.v1";

/**
 * Who may AUTHORIZE expensive validation. Exactly one entry, deliberately.
 *
 * The other named components are listed with what they are allowed to do, so a
 * future reader can see that their coexistence is by design and bounded.
 */
export const CAPACITY_AUTHORITIES = Object.freeze({
  grants: ["validation-admission"],
  may_refuse_only: ["memory-pressure-guard", "disk-headroom-guard"],
  may_serialize_named_resource_only: ["browser-certification-lease"],
  may_record_only: ["validation-queue", "validation-routing-hook", "health"],
});

/** Classes routed automatically. Same set S5 enforces — not a second opinion. */
export const ROUTED_CLASSES = Object.freeze([
  "heavy_test", "typecheck", "production_build", "browser_e2e", "machine_exclusive",
]);

/** Why a command was not routed. Each is reported differently. */
export const ROUTE_DECISIONS = Object.freeze([
  "allow_not_validation",     // nothing expensive here
  "allow_already_governed",   // it is already going through the broker
  "route_to_broker",          // authoritative + reconstructable: block and hand back the governed form
  "report_ambiguous",         // looks expensive, cannot be governed safely: allow and record
  "report_unclassifiable",    // a compound/pipeline we will not take apart: allow and record
]);

/** Shell operators that make a command line more than one command. */
const SEGMENT_SPLIT = /(\|\||&&|[;&|\n])/;

/** Constructs whose meaning does not survive being lifted into `vac run command --`. */
const UNSAFE_TO_LIFT = [
  { pattern: />>?|<|<<|\d>&\d/, why: "redirection" },
  { pattern: /\$\(|`/, why: "command substitution" },
  { pattern: /\bfor\b|\bwhile\b|\bif\b|\bcase\b/, why: "shell control flow" },
  { pattern: /\bexport\b|\bsource\b|^\s*\./, why: "shell state mutation" },
  { pattern: /&\s*$/, why: "backgrounding" },
];

/** Already inside the broker, or explicitly invoking it. */
export function alreadyGoverned(command, env = process.env) {
  if (String(env.ALLOY_VALIDATE_EXECUTING || "") === "1") return true;
  const s = String(command || "");
  return /(^|\s|\/)vac\s+run\b/.test(s)
    || /(^|\s|\/)vac-run\b/.test(s)
    || /(^|\s|\/)alloy-validate\b/.test(s)
    || /(^|\s|\/)vac-governed-validate(\.mjs)?\b/.test(s);
}

/**
 * Split a command line into inspectable segments.
 *
 * Returns the operators too, because a segment that sits inside a pipeline
 * cannot be lifted out of it — knowing THAT is what stops a guess.
 */
export function splitSegments(command) {
  const parts = String(command || "").split(SEGMENT_SPLIT);
  const segments = [];
  for (let i = 0; i < parts.length; i += 2) {
    const text = (parts[i] || "").trim();
    if (!text) continue;
    const before = i > 0 ? (parts[i - 1] || "").trim() : null;
    const after = (parts[i + 1] || "").trim() || null;
    segments.push({
      text,
      preceded_by: before,
      followed_by: after,
      // `&&`, `;` and newline SEQUENCE commands; `|` and `&` compose them, and a
      // composed command cannot be governed in isolation.
      composed: [before, after].some((op) => op === "|" || op === "&"),
    });
  }
  return segments;
}

/** Can this exact segment be handed to `vac run command --` unchanged? */
export function liftable(segment) {
  // Name the construct accurately. "part of a pipeline" is wrong for a
  // backgrounded command, and an operator reading a refusal deserves the actual
  // reason rather than the nearest category.
  if (segment.followed_by === "&") return { ok: false, why: "backgrounding" };
  if (segment.preceded_by === "|" || segment.followed_by === "|") {
    return { ok: false, why: "the command is part of a pipeline" };
  }
  if (segment.composed) return { ok: false, why: "the command is composed with another" };
  for (const { pattern, why } of UNSAFE_TO_LIFT) {
    if (pattern.test(segment.text)) return { ok: false, why };
  }
  return { ok: true };
}

/**
 * The governed form of a segment.
 *
 * A verbatim wrap. Every token the caller wrote is preserved in order — test
 * paths, filters, flags — because a broker that edits what a worker asked to
 * run is worse than no broker.
 */
export function governedReplacement(segmentText) {
  return `vac run command -- ${segmentText}`;
}

/**
 * The routing decision for one command line.
 *
 * Only an AUTHORITATIVE classification of a ROUTED class on a liftable segment
 * produces a route. Everything else either passes silently or is recorded — and
 * the two recorded kinds are kept apart, because "we could not classify this"
 * and "we classified it but cannot safely rewrite it" need different answers.
 */
export function routeCommand(command, { env = process.env } = {}) {
  const raw = String(command || "");
  if (!raw.trim()) return { decision: "allow_not_validation", segments: [] };
  if (alreadyGoverned(raw, env)) {
    return { decision: "allow_already_governed", segments: [], detail: "the command already routes through the broker" };
  }

  const segments = splitSegments(raw);
  const findings = [];
  for (const segment of segments) {
    const normalized = normalizeInvocation(segment.text);
    const classified = classifyNormalized(normalized);
    const cls = classified?.workload_class || null;
    if (!cls) continue;
    findings.push({
      segment: segment.text,
      workload_class: cls,
      confidence: classified.confidence,
      routed_class: ROUTED_CLASSES.includes(cls),
      lift: liftable(segment),
    });
  }

  const expensive = findings.filter((f) => f.routed_class);
  if (!expensive.length) {
    // NOTHING CLASSIFIED — but the line may still be running a suite.
    // `for f in a b; do npx vitest run tests/; done` splits into segments whose
    // first token is a shell keyword, so the classifier sees no tool and every
    // segment reads as harmless. A loop around a full suite would have escaped
    // in total silence. `looksLikeValidation` is the existing SHAPE selector —
    // it decides nothing about class or cost, only that this is worth saying
    // out loud rather than passing over.
    const shapeHeavy = looksLikeValidation(raw);
    const unsafe = segments.map((seg) => liftable(seg)).find((l) => !l.ok);
    if (shapeHeavy && unsafe) {
      return {
        decision: "report_unclassifiable",
        segments: findings,
        detail: `heavy validation appears inside ${unsafe.why}; it will not be taken apart`,
        allowed: true,
      };
    }
    return { decision: "allow_not_validation", segments: findings };
  }

  // Authoritative AND liftable — the only case we act on.
  const routable = expensive.filter((f) => f.confidence === "authoritative" && f.lift.ok);
  if (routable.length) {
    return {
      decision: "route_to_broker",
      segments: findings,
      // One replacement per expensive segment, in the order they appeared.
      replacements: routable.map((f) => ({
        original: f.segment,
        governed: governedReplacement(f.segment),
        workload_class: f.workload_class,
        label: WORKLOAD_CLASSES[f.workload_class] || f.workload_class,
      })),
      detail: `${routable.length} governed validation command(s) must run through the broker`,
    };
  }

  const unliftable = expensive.filter((f) => !f.lift.ok);
  if (unliftable.length) {
    return {
      decision: "report_unclassifiable",
      segments: findings,
      detail: unliftable.map((f) => `${f.workload_class}: ${f.lift.why}`).join("; "),
      // Allowed through on purpose. Breaking a correct command is the worse error.
      allowed: true,
    };
  }
  return {
    decision: "report_ambiguous",
    segments: findings,
    detail: expensive.map((f) => `${f.workload_class} classified ${f.confidence}`).join("; "),
    allowed: true,
  };
}

// ── Bypass records ───────────────────────────────────────────────────────────

/** How a heavy workload came to be running outside the broker. */
export const BYPASS_KINDS = Object.freeze([
  "routed",           // a managed provider command was intercepted and handed the governed form
  "ambiguous",        // looked expensive, could not be governed safely; allowed and recorded
  "unclassifiable",   // compound/pipeline; allowed and recorded
  "escaped",          // heavy work attributed to a MANAGED provider is running unbrokered
  "external",         // heavy work with no managed owner — observed, never governed
]);

export function bypassRecord({
  kind, command = null, decision = null, detail = null, pid = null, lane_id = null,
  pgid = null, run_id = null, now = Date.now(),
}) {
  return {
    schema_version: VALIDATION_ROUTING_SCHEMA,
    kind,
    command: command ? String(command).slice(0, 500) : null,
    decision,
    detail,
    pid: pid ?? null,
    /*
     * OWNERSHIP TRAVELS WITH THE BYPASS.
     *
     * 198 commands were recorded here as heavy-but-ungovernable and allowed
     * through, carrying a pid and a lane. A pid names one process; what
     * outlives a run is a process GROUP, and without the group nothing could
     * find `bash run-durability.sh | tail -6` after its run ended. A `tail`
     * sat blocked on the pipe holding the group open and a test span at 95%
     * CPU for four hours, invisible to every query Vacilando had.
     *
     * Deciding we will not GOVERN a command is not deciding we will not OWN
     * it. Routing and ownership are separate questions and only the first one
     * is allowed to answer "I cannot tell".
     */
    pgid: pgid ?? null,
    run_id: run_id ?? null,
    lane_id: lane_id ?? null,
    at: new Date(now).toISOString(),
  };
}

/** True when a bypass record carries enough to reconcile it later. */
export function bypassIsOwnable(record) {
  return Boolean(record && record.pgid != null && record.command);
}

/**
 * Classify unbrokered heavy work seen on the host.
 *
 * A managed provider's own heavy command running ungoverned is an ESCAPE and is
 * a problem: it means the routing this slice installed did not hold. Work with
 * no managed owner is EXTERNAL — a person in their own shell — and is observed,
 * never governed and never killed.
 */
export function classifyUnbrokered(workloads = [], { claims = [] } = {}) {
  const claimedPids = new Set(claims.map((c) => Number(c.pid)).filter(Number.isFinite));
  const claimedLanes = new Set(claims.map((c) => c.lane_id).filter(Boolean));
  const out = { escaped: [], external: [], governed: claims.length };
  for (const w of workloads) {
    if (!ROUTED_CLASSES.includes(w.workload_class)) continue;
    if (claimedPids.has(Number(w.pid))) continue;
    if (w.lane_id && claimedLanes.has(w.lane_id)) continue;
    const rec = { pid: w.pid ?? null, lane_id: w.lane_id ?? null, workload_class: w.workload_class, command: w.command ?? null };
    // Ownership by a managed seat is what separates an escape from an outsider.
    if (w.lane_id || w.root_provider_pid) out.escaped.push(rec);
    else out.external.push(rec);
  }
  return out;
}

/** Health summary for the routing state. */
export function summarizeRouting({ claims = [], unbrokered = null, bypasses = [] } = {}) {
  const byKind = Object.fromEntries(BYPASS_KINDS.map((k) => [k, 0]));
  for (const b of bypasses) byKind[b.kind] = (byKind[b.kind] || 0) + 1;
  return {
    schema_version: VALIDATION_ROUTING_SCHEMA,
    governed_claims: claims.length,
    escaped: unbrokered?.escaped?.length || 0,
    external: unbrokered?.external?.length || 0,
    bypass_events: byKind,
    // The single-owner statement, carried in the report so it is auditable.
    capacity_authority: CAPACITY_AUTHORITIES.grants,
  };
}
