/**
 * K1 — ATTENTION. The kernel's only cause.
 *
 * Governing (landed, in-branch): docs/platform/runtime/alloy-runtime-kernel.md §K1 (:100–163)
 *   "Attention is the kernel's only cause (Art 2.3)."
 *   "Acknowledge unconditionally, in under 50 ms, before anything else exists (Art 1.3)."
 *   "the newest attention wins, always — and say so once, for the whole kernel."
 *   "Owned state. The current attention (scope + target) and its supersession identity. Nothing else."
 *   "Attention never fetches, never renders, never commits."
 *   "A URL may hydrate attention on cold load; a URL may never *move* attention (Art 2.4)."
 *   "Attention cannot fail."
 *
 * ANTI-FORK (Art 2.3). ONE mechanism at every scope. Pointer, keyboard, Work View selection, subject
 * selection, search, command, notification, direct link, browser history and reload restoration are
 * ADAPTERS — they differ in how intent is expressed, never in the mechanism that receives it. There is
 * exactly one owner; the router is not a second one.
 *
 * SCOPE IS A NUMBER (Kernel :124-125): "Attention does not know that surfaces are larger than
 * subjects; it only knows scope is a number." The nesting SURFACE ⊃ LENS ⊃ SUBJECT ⊃ ASPECT is
 * therefore expressed as ordinal depth, and the Law of Scope Supersession is a comparison on it.
 */

import type { DestinationId } from "@/lib/runtime/graph/destinationId";

/** The Workspace surface's attention target. It is a place the operator attends, like any other. */
export const WORKSPACE_ATTENTION_TARGET = "workspace";

/** SURFACE ⊃ LENS ⊃ SUBJECT ⊃ ASPECT — coarser is a smaller number (Kernel :153). */
export const ATTENTION_SCOPE = { SURFACE: 0, LENS: 1, SUBJECT: 2, ASPECT: 3 } as const;
export type AttentionScope = (typeof ATTENTION_SCOPE)[keyof typeof ATTENTION_SCOPE];

/** How the intent was expressed. An adapter label — it never changes the mechanism. */
export type AttentionSource =
    | "pointer"
    | "keyboard"
    | "work_view_selection"
    | "subject_selection"
    | "search"
    | "command"
    | "notification"
    | "direct_url"
    | "history"
    | "reload";

/**
 * The smallest implementation-independent expression of where the operator wants to focus.
 *
 * Carries NO presentation state and NO fetched data — K1 "never fetches, never renders, never
 * commits", and its owned state is "the current attention (scope + target) and its supersession
 * identity. Nothing else."
 */
export type AttentionRef = {
    tenant: string;
    principal: string;
    /** Ordinal depth. The whole Law of Scope Supersession is a comparison on this. */
    scope: AttentionScope;
    /** The surface being attended (the Work Unit / destination identity). */
    target: string;
    /** The active lens. Present at LENS scope and finer. */
    lens: string | null;
    /**
     * COHORT SELECTION — stated, not inferred.
     *
     * `"none"` means the operator selected NO Work View: they named a record. `null` means nothing was
     * stated, and the surface resolves its configured default lens as it always has.
     *
     * These cannot be collapsed into `lens: null`, and that is the whole reason this field exists.
     * `lens: null` ALREADY means "no lens named, use the default" — it is what every Workspace link,
     * every cold URL without `?work_view_id`, and every Search click has always sent. Reading that same
     * absence as "no cohort selected" would silently turn `Lennon → Waitlist` contextual, because that
     * destination has never named its lens either. Two different intents were sharing one encoding;
     * this separates them rather than guessing between them.
     *
     * A LENS movement clears it: choosing a cohort is precisely what stops being contextual.
     */
    cohort: "none" | null;
    /** Record of Attention — the Operational Subject. Present at SUBJECT scope and finer. */
    subject: string | null;
    /** Present at ASPECT scope only. */
    aspect: string | null;
    /**
     * The CANONICAL Operational Destination this surface resolves to — `(workUnitId, workViewId)`,
     * resolved server-side (the URL is not the identity; it resolves INTO this). Present when a
     * producer with resolved identity (a Workspace link) caused the movement; null on a direct-URL
     * cold load until the provisioning answer resolves it. Runtime owners key preparation/provisioning
     * on THIS (via `destinationIdKey`), never on the raw `target` slug — so two URLs that resolve to
     * the same operational destination can never fracture. A SURFACE movement sets it; finer movements
     * inherit it (a subject/aspect change never leaves the destination).
     */
    destination: DestinationId | null;
    source: AttentionSource;
    /** Monotonic supersession identity. Strictly increasing per owner. */
    version: number;
};

/** A movement request. Coarser fields are INHERITED, never supplied — this is what makes attention
 *  downward-only by construction rather than by convention (see `move`). */
export type AttentionIntent =
    | {
          scope: 0;
          source: AttentionSource;
          target: string;
          lens?: string | null;
          /**
           * `"none"` = the operator named a record and selected no cohort. Only expressible at SURFACE
           * scope, because that is the movement that decides what kind of place this is; a finer
           * movement inherits the answer and a LENS movement replaces it by choosing.
           */
          cohort?: "none" | null;
          /** The producer's server-resolved canonical destination, when known (Workspace links). */
          destination?: DestinationId | null;
      }
    | { scope: 1; source: AttentionSource; lens: string }
    | { scope: 2; source: AttentionSource; subject: string }
    | { scope: 3; source: AttentionSource; aspect: string };

/** Cold-load hydration only (Art 2.4). A URL is read ONCE, into attention. */
export type AttentionHydration = {
    tenant: string;
    principal: string;
    target: string;
    lens?: string | null;
    subject?: string | null;
    aspect?: string | null;
    /** Server-resolved canonical destination, when the hydrating context could resolve it. */
    destination?: DestinationId | null;
    /** See {@link AttentionRef.cohort}. `"none"` survives a reload; that is what it is for. */
    cohort?: "none" | null;
    source: Extract<AttentionSource, "direct_url" | "history" | "reload">;
};

export type AttentionMovedEvent = {
    type: "attention.moved";
    ref: AttentionRef;
    /** The ref this movement supersedes, if any — the whole kernel is told once. */
    supersedes: AttentionRef | null;
    /** K4: t₀ — the moment intent existed. */
    t0: number;
};

export type AttentionListener = (e: AttentionMovedEvent) => void;

/**
 * THE LAW OF SCOPE SUPERSESSION (Kernel :157-158).
 *
 *   "An attention movement at a coarser scope supersedes every finer-scope movement and preparation
 *    within the context it leaves."
 *
 * plus "the newest attention wins, always" for an equal scope. Expressed on ordinal depth:
 * a movement supersedes pending work at its own scope or finer. A FINER movement never touches a
 * coarser context — which is exactly why an Aspect change cannot cancel subject or lens preparation.
 *
 * Tenant/principal isolation is absolute: attention in one tenant never supersedes another's.
 */
export function supersedes(next: AttentionRef, pending: AttentionRef): boolean {
    if (next.tenant !== pending.tenant || next.principal !== pending.principal) return false;
    if (next.version <= pending.version) return false;
    return next.scope <= pending.scope;
}

/** K4 instrumentation surface. K1 emits t₀ and the acknowledgment mark (Kernel :138). */
export type AttentionInstrumentation = {
    onAccepted?: (ref: AttentionRef, t0: number) => void;
    onAcknowledged?: (ref: AttentionRef, acknowledgmentMs: number) => void;
    onSuperseded?: (superseded: AttentionRef, by: AttentionRef) => void;
};

/**
 * The single canonical Attention owner.
 *
 * `move()` is SYNCHRONOUS and cannot fail (Kernel :129-131: "Attention cannot fail. A movement is
 * always accepted and always acknowledged; if everything downstream fails, the operator was still
 * answered."). It never awaits the router, the network, provisioning, rendering, or animation.
 */
export class AttentionOwner {
    private current: AttentionRef | null = null;
    private version = 0;
    private listeners = new Set<AttentionListener>();
    private clock: () => number;

    constructor(private instrumentation: AttentionInstrumentation = {}, clock?: () => number) {
        this.clock = clock ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    }

    get(): AttentionRef | null {
        return this.current;
    }

    subscribe(l: AttentionListener): () => void {
        this.listeners.add(l);
        return () => this.listeners.delete(l);
    }

    /**
     * Cold-load hydration (Art 2.4). A URL is read ONCE, INTO attention — it does not "move" it, and
     * it never becomes a second owner. Only legal when no attention exists yet.
     */
    hydrate(h: AttentionHydration): AttentionRef {
        if (this.current) {
            throw new Error(
                "K1: a URL may hydrate attention on cold load, and may never move it (Art 2.4). Attention already exists.",
            );
        }
        const scope: AttentionScope = h.aspect
            ? ATTENTION_SCOPE.ASPECT
            : h.subject
              ? ATTENTION_SCOPE.SUBJECT
              : h.lens
                ? ATTENTION_SCOPE.LENS
                : ATTENTION_SCOPE.SURFACE;
        const t0 = this.clock();
        const ref: AttentionRef = {
            tenant: h.tenant,
            principal: h.principal,
            scope,
            target: h.target,
            lens: h.lens ?? null,
            cohort: h.cohort ?? null,
            subject: h.subject ?? null,
            aspect: h.aspect ?? null,
            destination: h.destination ?? null,
            source: h.source,
            version: ++this.version,
        };
        this.current = ref;
        // Hydration establishes attention, so it is acknowledged like any other movement:
        // "Receive EVERY attention movement … Acknowledge unconditionally." On a cold load there is
        // nothing to wait for, so the obligation is discharged immediately — but it is still
        // discharged, and still measured. Instrumentation must not have a hole here, or a cold entry
        // would report no acknowledgment at all.
        this.instrumentation.onAccepted?.(ref, t0);
        this.instrumentation.onAcknowledged?.(ref, this.clock() - t0);
        this.emit({ type: "attention.moved", ref, supersedes: null, t0 });
        return ref;
    }

    /**
     * Receive an attention movement. Synchronous, unconditional, always acknowledged.
     *
     * DOWNWARD-ONLY BY CONSTRUCTION: an intent may only name fields at its own scope or finer.
     * Everything coarser is INHERITED from the current attention, so a SUBJECT movement structurally
     * cannot change the lens, the target, the Business Process, the Queue, or the Context Frame —
     * they are not expressible in the request. This is why the guarantee is not a convention.
     */
    move(intent: AttentionIntent): AttentionRef {
        const t0 = this.clock();
        const prev = this.current;
        if (!prev && intent.scope !== ATTENTION_SCOPE.SURFACE) {
            throw new Error("K1: the first attention movement must establish a SURFACE, or hydrate from a URL.");
        }

        let ref: AttentionRef;
        switch (intent.scope) {
            case ATTENTION_SCOPE.SURFACE:
                ref = {
                    tenant: prev!.tenant,
                    principal: prev!.principal,
                    scope: ATTENTION_SCOPE.SURFACE,
                    target: intent.target,
                    // A surface movement abandons the lens/subject/aspect of the surface it leaves.
                    lens: intent.lens ?? null,
                    // …and its cohort selection with them. Carried forward would mean arriving at a new
                    // surface already claiming the last one's answer about whether a cohort was chosen.
                    cohort: intent.cohort ?? null,
                    subject: null,
                    aspect: null,
                    // The canonical destination the producer resolved for this surface (null if it
                    // could not resolve one — e.g. a bare direct link). Node-level: no subject/mode.
                    destination: intent.destination ?? null,
                    source: intent.source,
                    version: ++this.version,
                };
                break;
            case ATTENTION_SCOPE.LENS:
                ref = {
                    ...prev!,
                    scope: ATTENTION_SCOPE.LENS,
                    lens: intent.lens,
                    // CHOOSING A COHORT IS WHAT ENDS CONTEXTUAL FOCUS. Cleared here, so a lens
                    // selection out of a contextual surface cannot leave "no cohort selected" standing
                    // next to a lit pill. There is no intent shape that can set it back at this scope.
                    cohort: null,
                    // A lens movement abandons the subject/aspect under the lens it leaves.
                    subject: null,
                    aspect: null,
                    // The lens IS the work view — re-point the canonical destination to it (the
                    // Work View id and the lens are the same identifier space, U-P2). Subject cleared.
                    destination: prev!.destination
                        ? { ...prev!.destination, workViewId: intent.lens, subjectId: null, focusMode: null }
                        : null,
                    source: intent.source,
                    version: ++this.version,
                };
                break;
            case ATTENTION_SCOPE.SUBJECT:
                ref = {
                    ...prev!,
                    scope: ATTENTION_SCOPE.SUBJECT,
                    // lens/target INHERITED — a subject movement cannot express a lens change.
                    subject: intent.subject,
                    aspect: null,
                    source: intent.source,
                    version: ++this.version,
                };
                break;
            case ATTENTION_SCOPE.ASPECT:
                ref = {
                    ...prev!,
                    scope: ATTENTION_SCOPE.ASPECT,
                    // subject/lens/target INHERITED — an aspect movement preserves all of them.
                    aspect: intent.aspect,
                    source: intent.source,
                    version: ++this.version,
                };
                break;
        }

        this.current = ref;
        const superseded = prev && supersedes(ref, prev) ? prev : null;
        this.instrumentation.onAccepted?.(ref, t0);
        if (superseded) this.instrumentation.onSuperseded?.(superseded, ref);

        // ACKNOWLEDGMENT — discharged here, before anything else exists. Nothing downstream is awaited.
        this.instrumentation.onAcknowledged?.(ref, this.clock() - t0);

        this.emit({ type: "attention.moved", ref, supersedes: superseded, t0 });
        return ref;
    }

    private emit(e: AttentionMovedEvent) {
        for (const l of this.listeners) {
            try {
                l(e);
            } catch {
                // K1 cannot fail. A listener fault may never break acknowledgment.
            }
        }
    }
}

/**
 * Canonical URL ⇄ Attention mapping.
 *
 * The URL is an EXTERNAL REPRESENTATION, not intent. `attentionFromUrl` is the cold-load read
 * (Art 2.4); `urlFromAttention` is the projection K3 will use to write history at commit in D4.
 * Neither is an owner.
 */
export function attentionFromUrl(
    url: URL,
    identity: { tenant: string; principal: string },
    source: AttentionHydration["source"] = "direct_url",
): AttentionHydration | null {
    const m = url.pathname.match(/\/workspace\/work-unit\/([^/?#]+)/);
    if (m) {
        return {
            tenant: identity.tenant,
            principal: identity.principal,
            target: decodeURIComponent(m[1]),
            lens: url.searchParams.get("work_view_id"),
            // Read STRICTLY: only the exact token counts. Hostile or stale query state must not be able
            // to suppress a cohort by accident, and an unrecognised value is not a request for anything.
            cohort: url.searchParams.get("cohort") === "none" ? "none" : null,
            subject: url.searchParams.get("subject_id"),
            aspect: url.searchParams.get("aspect"),
            source,
        };
    }
    // The Workspace is a surface too. A cold /workspace must establish attention, or the operator's
    // first gesture would have no context to move FROM.
    if (/\/workspace\/?$/.test(url.pathname)) {
        return {
            tenant: identity.tenant,
            principal: identity.principal,
            target: WORKSPACE_ATTENTION_TARGET,
            lens: null,
            subject: null,
            aspect: null,
            source,
        };
    }
    return null;
}

/** The projection K3 commits to history in D4. Committed Focus → URL; never the reverse. */
export function urlFromAttention(ref: AttentionRef, base = ""): string {
    const p = new URLSearchParams();
    if (ref.lens) p.set("work_view_id", ref.lens);
    // THE ABSENCE OF A COHORT IS PROJECTED, because it has to survive a reload. A contextual URL
    // carrying no `work_view_id` and nothing else would read on cold entry exactly like every ordinary
    // link that omits one — and resolve the default lens, which is the defect returning by refresh.
    // Never both: a chosen lens and "no cohort" cannot be true at once.
    else if (ref.cohort === "none") p.set("cohort", "none");
    if (ref.subject) p.set("subject_id", ref.subject);
    if (ref.aspect) p.set("aspect", ref.aspect);
    const q = p.toString();
    return `${base}/workspace/work-unit/${encodeURIComponent(ref.target)}${q ? `?${q}` : ""}`;
}
