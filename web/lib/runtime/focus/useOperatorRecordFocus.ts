"use client";

/**
 * OPERATOR INTENT → ATTENTION TARGET (client half). THE adapter every migrated drawer caller uses.
 *
 * The gesture this replaces was always the same shape: "the operator pointed at a record, put it in
 * front of them." It used to be answered with `openDrawer(...)`, which mounts the generic modal
 * overlay. It is answered here as an attention movement onto the record's real operational host.
 *
 *     record id  →  host Work Unit + host record  →  SURFACE → SUBJECT → ASPECT
 *
 * ── WHY ONE ADAPTER AND NOT A HELPER PER CALLER ──
 *
 * `useWorkUnitEntryGesture` already records the lesson: `/workspace/work-unit/:slug` is SEED-ONLY, so
 * a caller that navigates instead of moving attention does not render slowly — it renders NOTHING,
 * with no error. Every caller that grows its own destination logic is one more place that can be
 * wired to a route instead of to K1. So the destination logic lives here, once, and callers state
 * intent.
 *
 * ── THE TWO WORLDS THIS SPANS ──
 *
 * Some callers are inside the Runtime Kernel (the Work Unit surface: cards, layout runtime, right
 * rail). Some are not (`/admin/messages`, `/admin/communications`, the AI command surface — the
 * kernel is mounted inside the workspace providers, not the shell). Both used to open the same modal.
 *
 *   inside the kernel        → an attention movement (never a route push: Gate A)
 *   inside the workspace
 *     layout, above the      → state the intent; `OperatorFocusAttentionListener`, mounted inside
 *     kernel                   the kernel, performs the same movement
 *   outside the workspace    → a NAVIGATION to the canonical address, which is a COLD ENTRY and the
 *     layout entirely          one case where a URL is allowed to establish attention (Art 2.4).
 *                              `subject_id` and `aspect` ride the address, so the panel lands on the
 *                              same card.
 *
 * The middle case is the one that is easy to get wrong and impossible to see. Shell chrome
 * (`TopNavBar`, `AdminV2ShellDrawerScope`) wraps the workspace tree, so it is inside the layout but
 * above the kernel — and a `router.push` from there does not remount the layout, so nothing re-reads
 * the URL and the surface goes blank with no error. This is not a fallback ladder; each branch is the
 * only mechanism that works from where the caller stands.
 *
 * ── NULL IS AN ANSWER ──
 *
 * When no active Work Unit holds the record — or the operator may not reach it — this returns false
 * and does nothing. It must never degrade to opening a modal: that is the product being removed, and
 * "the record is nowhere the operator can work it" is information, not a failure to route.
 *
 * ── TWO INTENTS, DECLARED BY THE CALLER ──
 *
 *   operational     (default) — "where do I WORK this?" Everything above. Still answers false when
 *                               nothing does, and every pre-existing caller keeps that answer.
 *   durable_record            — "OPEN this record." Goes to the record's own canonical address and
 *                               does not require a queue to hold it.
 *
 * The caller declares which, because the same record has different right answers under the two and
 * `false` is LEGITIMATE on the operational side — so an inferred intent would fail silently, which
 * is the exact defect class this adapter exists to prevent. Callers still state only intent: the
 * adapter owns household resolution, Work Unit keys, addresses and composition.
 *
 * ── WHY DURABLE PUSHES A ROUTE WHEN GATE A FORBIDS IT ──
 *
 * Gate A forbids pushing a WORK-UNIT route on an active runtime, because that route is SEED-ONLY:
 * navigating instead of moving attention renders nothing. The durable record address is the opposite
 * — it has no queue page to be a member of, so the address IS the intent, which is the one case the
 * doctrine already permits a URL to establish attention (Art 2.4, cold entry). Same reasoning, other
 * direction; not an exception to it.
 */

import { useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { CANONICAL_OPERATOR_BASE } from "@/lib/admin/canonicalAdminRoutes";
import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import { dispatchOperatorFocusSelection } from "@/lib/runtime/focus/operatorFocusSelection";
import { formatCardFocusAspect, type CardFocusInput } from "@/lib/runtime/kernel/attentionCardFocus";
import { useRuntimeKernelOptional } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { ATTENTION_SCOPE } from "@/lib/runtime/kernel/attention";
import { useWorkUnitEntryMovement } from "@/lib/runtime/kernel/useWorkUnitEntryGesture";
import type { OperatorFocusTarget } from "@/lib/workUnits/operatorFocusTarget";
import { durableRecordHref, durableSubjectTypeFor } from "@/lib/runtime/focus/durableRecordRoute";

/**
 * What the caller is asking for. Never inferred from subject type or caller location.
 */
export type OperatorRecordFocusIntent = "operational" | "durable_record";

export type OperatorRecordFocusRequest = {
    /** The record the operator pointed at — `opportunities`, `persons`, `customers`. */
    entity_type: string;
    entity_id: string;
    /**
     * Card + row to land on inside the resolved panel. Carried as the kernel's ASPECT, which is
     * finer than the Operational Subject and therefore inherits it — it can never cancel the
     * subject's preparation.
     */
    card_focus?: CardFocusInput | null;
    /**
     * A host already known to the caller (a queue row knows its own case and unit). Skips the
     * round trip entirely; both fields must be present to be used.
     */
    known_host?: { entity_id: string; work_unit_key: string | null } | null;
    /**
     * The Work View ROW to select, when the caller knows it — `subjectRows[].entityId` in the
     * runtime's vocabulary.
     *
     * THE HOST IS NOT ALWAYS THE SUBJECT. This request resolves a HOST record (the case whose Focus
     * Panel composes), and for a family-grain lens that record is also the evaluated row, so passing
     * the host as the subject worked and hid the distinction. In a CHILD-grain lens the evaluated
     * rows are participations: the case matches nothing, and the runtime's membership guard refuses
     * with `subject_unavailable` — "That record isn't in this Work View".
     *
     * Absent, the host remains the subject, which keeps every existing caller (and family grain)
     * behaving exactly as before.
     *
     * Operational only. A durable record has no Work View to be a row in.
     */
    operational_member_id?: string | null;
    /**
     * Which question this gesture is asking. Defaults to `operational`, so every caller written
     * before durable records keeps its exact behaviour without being touched.
     */
    intent?: OperatorRecordFocusIntent;
    /**
     * A business context the CALLER would like the durable host to open on — a preference, never a
     * commitment, and never an operational movement.
     *
     * Search sets it when the query named a context ("Lennon assignment"); Roster leaves it unset
     * and the host resolves its own default. A record must stay correct with no preference at all,
     * so nothing downstream may require this. `durable_record` only.
     */
    preferred_context_key?: string | null;
};

/** Module-scoped so a repeated gesture on the same record does not re-ask. */
const targetCache = new Map<string, OperatorFocusTarget | null>();

function cacheKey(entityType: string, entityId: string): string {
    return `${entityType.trim().toLowerCase()}:${entityId.trim()}`;
}

/** Exported for tests and for surfaces that must invalidate after a record moves queues. */
export function clearOperatorFocusTargetCache(): void {
    targetCache.clear();
}

async function fetchFocusTarget(
    entityType: string,
    entityId: string
): Promise<OperatorFocusTarget | null> {
    const key = cacheKey(entityType, entityId);
    if (targetCache.has(key)) return targetCache.get(key) ?? null;

    let resolved: OperatorFocusTarget | null = null;
    try {
        const res = await fetch("/api/admin/operator-focus/resolve", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
        });
        if (res.ok) {
            const json = (await res.json().catch(() => null)) as
                | { ok?: boolean; target?: OperatorFocusTarget | null }
                | null;
            resolved = json?.ok ? json.target ?? null : null;
        }
    } catch {
        // A network failure is not a reason to open the overlay. Answer "nowhere" and let the
        // caller stay put; the operator can retry the gesture.
        resolved = null;
    }
    targetCache.set(key, resolved);
    return resolved;
}

export type OperatorRecordFocus = (request: OperatorRecordFocusRequest) => Promise<boolean>;

export function useOperatorRecordFocus(): OperatorRecordFocus {
    const kernel = useRuntimeKernelOptional();
    const move = useWorkUnitEntryMovement();
    const router = useRouter();
    const pathname = usePathname();
    // Latest gesture wins. A slower resolution for an earlier click must not overwrite the record
    // the operator has since asked for — the kernel supersedes movements, but a stale resolution
    // that arrives after the newer one would still emit a movement, and the newest emitted wins.
    const gestureRef = useRef(0);

    return useCallback(
        async (request: OperatorRecordFocusRequest): Promise<boolean> => {
            const entityId = request.entity_id?.trim() ?? "";
            const entityType = request.entity_type?.trim() ?? "";
            if (!entityId || !entityType) return false;

            const gesture = ++gestureRef.current;
            const aspect = formatCardFocusAspect(request.card_focus ?? null);

            // ── DURABLE RECORD ─────────────────────────────────────────────────────────────
            //
            // The record's own address. No host resolution, no household walk, no Work Unit — those
            // answer "where is this worked", and this gesture is not asking that.
            //
            // An `opportunity` has no durable grain and falls through to the operational path on
            // purpose: a case HAS an operational home, and routing it to a durable surface would
            // route around the queue it belongs to.
            if (request.intent === "durable_record") {
                const grain = durableSubjectTypeFor(entityType);
                if (grain) {
                    // The ASPECT rides the address so a cold load lands on the same card. Absent, the
                    // grain's default composition decides — durable attention never requires an aspect.
                    const cardKey = request.card_focus?.card_key ?? null;
                    const contextKey = (request.preferred_context_key ?? "").trim() || null;
                    router.push(durableRecordHref(grain, entityId, cardKey, contextKey));
                    return true;
                }
            }

            // ── FAST PATH: the record is already the Record of Attention ──
            //
            // A card link inside the panel the operator is already in changes nothing coarser than
            // the ASPECT. Resolving a host would be a pointless round trip, and re-emitting the
            // SURFACE movement would re-prepare a surface that is already committed.
            const current = kernel?.attention.get() ?? null;
            const known = request.known_host ?? null;
            const hostIdIfSame =
                known?.entity_id?.trim() || (entityType.toLowerCase().startsWith("opportunit") ? entityId : "");
            if (kernel && aspect && hostIdIfSame && current?.subject === hostIdIfSame) {
                kernel.attention.move({ scope: ATTENTION_SCOPE.ASPECT, aspect, source: "pointer" });
                return true;
            }

            const target: OperatorFocusTarget | null =
                known && known.entity_id.trim()
                    ? {
                          host_entity_type: "opportunities",
                          host_entity_id: known.entity_id.trim(),
                          host_work_unit_key: known.work_unit_key,
                      }
                    : await fetchFocusTarget(entityType, entityId);

            if (gesture !== gestureRef.current) return false; // superseded mid-resolution
            const workUnitKey = target?.host_work_unit_key?.trim() ?? "";
            const hostId = target?.host_entity_id?.trim() ?? "";
            // No active unit holds the record: there is no operational surface to move to, and
            // inventing one commits the operator to a queue the record is not in.
            if (!workUnitKey || !hostId) return false;

            // THE SELECTED ROW, which is not always the host. A caller that knows the Work View row
            // (Search, from evaluated membership) names it; everyone else keeps the host, which is
            // correct for family grain because there the case IS the evaluated row.
            const memberId = (request.operational_member_id ?? "").trim() || hostId;

            const href = operatorWorkUnitHrefFromKey(workUnitKey);

            if (kernel) {
                // Gate A: on an active runtime this is an attention movement, never a route push.
                return move(href, null, memberId, aspect);
            }

            // Inside the workspace layout but above the kernel (shell chrome). A push here changes
            // the address and blanks the surface, because the layout does not remount and nothing
            // re-reads the URL. State the intent; the in-kernel listener performs the movement.
            const path = pathname ?? "";
            if (path === CANONICAL_OPERATOR_BASE || path.startsWith(`${CANONICAL_OPERATOR_BASE}/`)) {
                dispatchOperatorFocusSelection({
                    entity_type: target?.host_entity_type ?? "opportunities",
                    // The HOST stays the host — the Focus Panel composes against the case.
                    entity_id: hostId,
                    host_work_unit_key: workUnitKey,
                    // …and the ROW travels beside it, so the listener can select a participation
                    // without the panel losing the case it needs to render.
                    operational_member_id: request.operational_member_id ?? null,
                    card_focus: request.card_focus ?? null,
                });
                return true;
            }

            // Outside the workspace layout entirely. The canonical address IS the intent here, and a
            // cold load hydrates attention from it exactly once (Art 2.4).
            const params = new URLSearchParams({ subject_id: memberId });
            if (aspect) params.set("aspect", aspect);
            router.push(`${href}${href.includes("?") ? "&" : "?"}${params.toString()}`);
            return true;
        },
        [kernel, move, router, pathname]
    );
}
