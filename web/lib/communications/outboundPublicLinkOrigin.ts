/**
 * Public-link origin enforcement at the canonical outbound seam.
 *
 * WHY HERE
 *
 * A recipient-facing URL is materialized as absolute text when the message is AUTHORED,
 * and nothing re-derives it afterwards. The authoring runtime and the delivering runtime
 * are not the same machine: managed agent slots run at `http://localhost:301X` against the
 * same database hosted staging reads, so a draft prepared in a slot arrives in staging's
 * composer already carrying a `localhost` booking link. The operator sends it from
 * staging, the hosted origin is never consulted, and a family receives a URL that points
 * at somebody else's laptop.
 *
 * `enqueueCanonicalOutboundMessage` is the last place application code owns the body —
 * dispatch is a separate worker reading queued rows. So this is where the delivering
 * environment gets to have the final word on the origin.
 *
 * WHAT IT DOES
 *
 * In a hosted runtime: re-anchor every loopback URL onto the runtime's own canonical
 * origin, then REFUSE the send if any loopback link survived. Refusing is the point — a
 * link a recipient cannot open is not a degraded send, it is a failed one, and it should
 * fail where an operator can see it rather than in an inbox.
 *
 * In a local or certification runtime: change nothing. `http://localhost:3013/a/AbCdEf12`
 * is the CORRECT link there, and rewriting it would break local development to fix a
 * hosted defect.
 *
 * The rewrite touches `body`, `subject` AND `rendered_snapshot`, because the email that
 * actually leaves the building is built from `rendered_snapshot.html` / `.text` — fixing
 * only `body` would repair the record and still deliver the broken link.
 */

import {
    findLoopbackUrls,
    isHostedRuntime,
    PUBLIC_ORIGIN_OPERATOR_MESSAGE,
    classifyPublicRuntime,
    rehostLoopbackUrls,
    resolvePublicAppOrigin,
    type PublicOriginFailureCode,
} from "@/lib/publicAppUrl";

export type OutboundLinkOriginFailureCode =
    | PublicOriginFailureCode
    /** A loopback link survived the rewrite — refuse rather than deliver it. */
    | "undeliverable_link_origin";

export type OutboundLinkOriginDecision =
    | {
          ok: true;
          body: string;
          subject: string | null | undefined;
          renderedSnapshot: unknown;
          /** How many loopback URLs were re-anchored. `0` on the overwhelmingly common path. */
          rehostedCount: number;
          /** The origin every link now carries, or `null` when the runtime is not hosted. */
          origin: string | null;
      }
    | {
          ok: false;
          code: OutboundLinkOriginFailureCode;
          /** Safe to show an operator. */
          message: string;
          /** Diagnostic detail for logs and audit — never for a recipient. */
          detail: string;
      };

export type OutboundLinkOriginInput = {
    body: string;
    subject?: string | null;
    renderedSnapshot?: unknown;
    env?: Record<string, string | undefined>;
};

/** Rewrite every string inside an arbitrary JSON-ish snapshot. */
function mapSnapshotStrings(value: unknown, fn: (s: string) => string): unknown {
    if (typeof value === "string") return fn(value);
    if (Array.isArray(value)) return value.map((v) => mapSnapshotStrings(v, fn));
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = mapSnapshotStrings(v, fn);
        }
        return out;
    }
    return value;
}

/** Collect every string inside an arbitrary JSON-ish snapshot. */
function collectSnapshotStrings(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const v of value) collectSnapshotStrings(v, out);
    else if (value && typeof value === "object") {
        for (const v of Object.values(value as Record<string, unknown>)) collectSnapshotStrings(v, out);
    }
    return out;
}

export function enforceOutboundPublicLinkOrigin(
    input: OutboundLinkOriginInput,
): OutboundLinkOriginDecision {
    const env = input.env ?? (process.env as Record<string, string | undefined>);
    const runtime = classifyPublicRuntime(env);
    const body = String(input.body ?? "");
    const subject = input.subject;
    const snapshot = input.renderedSnapshot;

    // Local and certification runtimes OWN their loopback origin. Nothing to enforce.
    if (!isHostedRuntime(runtime)) {
        return { ok: true, body, subject, renderedSnapshot: snapshot, rehostedCount: 0, origin: null };
    }

    const surfaces = [body, String(subject ?? ""), ...collectSnapshotStrings(snapshot)];
    const offending = surfaces.flatMap((s) => findLoopbackUrls(s));

    const decision = resolvePublicAppOrigin(env);
    if (!decision.ok) {
        // A hosted runtime with no usable origin must not send at all. This refuses even a
        // message that happens to contain no links today: the configuration is broken, and
        // discovering that on the first message that DOES carry one is too late.
        return {
            ok: false,
            code: decision.code,
            message: PUBLIC_ORIGIN_OPERATOR_MESSAGE[decision.code],
            detail: decision.message,
        };
    }

    if (offending.length === 0) {
        return { ok: true, body, subject, renderedSnapshot: snapshot, rehostedCount: 0, origin: decision.origin };
    }

    const rehost = (s: string) => rehostLoopbackUrls(s, decision.origin);
    const nextBody = rehost(body);
    const nextSubject = subject == null ? subject : rehost(String(subject));
    const nextSnapshot = snapshot === undefined ? snapshot : mapSnapshotStrings(snapshot, rehost);

    const residual = [
        nextBody,
        String(nextSubject ?? ""),
        ...collectSnapshotStrings(nextSnapshot),
    ].flatMap((s) => findLoopbackUrls(s));

    if (residual.length > 0) {
        return {
            ok: false,
            code: "undeliverable_link_origin",
            message:
                "This message cannot be sent: it contains a link that points at localhost, which no recipient can open.",
            detail: `Loopback links survived re-anchoring onto ${decision.origin}: ${residual.slice(0, 5).join(", ")}`,
        };
    }

    return {
        ok: true,
        body: nextBody,
        subject: nextSubject,
        renderedSnapshot: nextSnapshot,
        rehostedCount: offending.length,
        origin: decision.origin,
    };
}
