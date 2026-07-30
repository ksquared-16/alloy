import {
    dispatchOpportunityQueueUpdated,
    type OpportunityQueueUpdatedDetail,
} from "@/lib/admin/opportunityQueueRefreshEvent";
import { ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH } from "@/lib/adminV2/opportunityDrawerTaskEvents";

export const ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH = "adminv2:opportunity-drawer-record-patch" as const;

export type OpportunityDrawerRecordPatchDetail = {
    opportunity_id: string;
    record: Record<string, unknown>;
};

export type OpportunityDrawerRefreshScope =
    | "operational_tasks"
    | "tour_surfaces"
    | "activity"
    | "documents"
    | "header_actions";

const TOUR_SURFACE_ACTION_KEYS = new Set([
    "schedule_tour",
    "reschedule_tour",
    "tour_booking",
    "record_tour_outcome",
    "confirm_tour",
]);

export function parseOpportunityDrawerRecordPatchDetail(ev: Event): OpportunityDrawerRecordPatchDetail | null {
    if (!(ev instanceof CustomEvent)) return null;
    const raw = ev.detail;
    if (!raw || typeof raw !== "object") return null;
    const opportunityId =
        typeof (raw as OpportunityDrawerRecordPatchDetail).opportunity_id === "string"
            ? (raw as OpportunityDrawerRecordPatchDetail).opportunity_id.trim()
            : "";
    const record = (raw as OpportunityDrawerRecordPatchDetail).record;
    if (!opportunityId || !record || typeof record !== "object" || Array.isArray(record)) return null;
    return { opportunity_id: opportunityId, record };
}


/**
 * Merge an incoming opportunity drawer record patch into the current display record.
 * Preserves nested snapshots when the patch was built from a stale truth snapshot.
 */
export function mergeOpportunityDrawerDisplayRecordPatch(
    prev: Record<string, unknown>,
    incoming: Record<string, unknown>,
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...prev, ...incoming };

    if (incoming._opportunity_persons !== undefined) {
        merged._opportunity_persons = incoming._opportunity_persons;
    }
    if (incoming._customer_persons !== undefined) {
        merged._customer_persons = incoming._customer_persons;
    }
    if (incoming._inquiry_children !== undefined) {
        // Preserve child photo_url when a later patch rebuilds inquiry children without photos
        // (commit-critical / queue projections omit person metadata.photo_url).
        const prevChildren = Array.isArray(prev._inquiry_children)
            ? (prev._inquiry_children as Record<string, unknown>[])
            : [];
        const nextChildren = Array.isArray(incoming._inquiry_children)
            ? (incoming._inquiry_children as Record<string, unknown>[])
            : [];
        if (prevChildren.length && nextChildren.length) {
            merged._inquiry_children = nextChildren.map((row) => {
                if (!row || typeof row !== "object") return row;
                const hasPhoto =
                    typeof row.photo_url === "string" && row.photo_url.trim().length > 0;
                if (hasPhoto) return row;
                const id = String(row.id ?? "").trim();
                const personId = String(row.person_id ?? "").trim();
                const memberId = String(row.customer_member_id ?? "").trim();
                const prior = prevChildren.find((p) => {
                    if (!p || typeof p !== "object") return false;
                    const pid = String(p.id ?? "").trim();
                    const pp = String(p.person_id ?? "").trim();
                    const pm = String(p.customer_member_id ?? "").trim();
                    return (
                        (id && (pid === id || pp === id || pm === id))
                        || (personId && (pp === personId || pid === personId || pm === personId))
                        || (memberId && (pm === memberId || pid === memberId))
                    );
                });
                const priorPhoto =
                    prior && typeof prior.photo_url === "string" ? prior.photo_url.trim() : "";
                if (!priorPhoto) return row;
                return { ...row, photo_url: priorPhoto };
            });
        } else {
            merged._inquiry_children = incoming._inquiry_children;
        }
    }

    // Scheduling projection is a bag with per-member children — merge byMemberId so a
    // single-child reload after assignment delete refreshes Children / Schedule cards.
    const prevSched = prev._scheduling_projection;
    const incSched = incoming._scheduling_projection;
    if (incSched && typeof incSched === "object" && !Array.isArray(incSched)) {
        const prevBag =
            prevSched && typeof prevSched === "object" && !Array.isArray(prevSched)
                ? (prevSched as Record<string, unknown>)
                : {};
        const nextBag: Record<string, unknown> = { ...prevBag, ...(incSched as Record<string, unknown>) };
        const prevBy = prevBag.byMemberId;
        const incBy = (incSched as Record<string, unknown>).byMemberId;
        if (incBy && typeof incBy === "object" && !Array.isArray(incBy)) {
            nextBag.byMemberId = {
                ...(prevBy && typeof prevBy === "object" && !Array.isArray(prevBy)
                    ? (prevBy as Record<string, unknown>)
                    : {}),
                ...(incBy as Record<string, unknown>),
            };
        }
        merged._scheduling_projection = nextBag;
    }

    const prevAddr = prev._person_address_by_id;
    const incAddr = incoming._person_address_by_id;
    if (incAddr && typeof incAddr === "object" && !Array.isArray(incAddr)) {
        const out: Record<string, Record<string, unknown>> =
            prevAddr && typeof prevAddr === "object" && !Array.isArray(prevAddr)
                ? { ...(prevAddr as Record<string, Record<string, unknown>>) }
                : {};
        for (const [personId, row] of Object.entries(incAddr as Record<string, Record<string, unknown>>)) {
            out[personId] = { ...(out[personId] ?? {}), ...row };
        }
        merged._person_address_by_id = out;
    }

    return merged;
}

/** In-place VM / legacy drawer record merge — avoids full drawer reload. */
export function dispatchOpportunityDrawerRecordPatch(
    opportunityId: string,
    record: Record<string, unknown>
): void {
    if (typeof window === "undefined") return;
    const id = opportunityId.trim();
    if (!id) return;
    window.dispatchEvent(
        new CustomEvent<OpportunityDrawerRecordPatchDetail>(ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH, {
            detail: { opportunity_id: id, record },
        })
    );
}

export function dispatchOpportunityDrawerOperationalTasksRefresh(opportunityId: string): void {
    if (typeof window === "undefined") return;
    const id = opportunityId.trim();
    if (!id) return;
    window.dispatchEvent(
        new CustomEvent(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, {
            detail: { opportunity_id: id },
        })
    );
}

export function isTourSurfaceActionKey(actionKey: string | undefined | null): boolean {
    const key = (actionKey ?? "").trim();
    return TOUR_SURFACE_ACTION_KEYS.has(key);
}

/** Scoped queue + section listeners — no admin-entity-saved / full drawer reload. */
export function dispatchOpportunityDrawerScopedUpdate(
    opportunityId: string,
    actionKey: string,
    scopes: readonly OpportunityDrawerRefreshScope[] = ["activity"]
): void {
    if (typeof window === "undefined") return;
    const id = opportunityId.trim();
    const key = actionKey.trim() || "mutation";
    if (!id) return;

    if (scopes.includes("operational_tasks")) {
        dispatchOpportunityDrawerOperationalTasksRefresh(id);
    }

    const queueDetail: OpportunityQueueUpdatedDetail = { id, action_key: key };
    if (scopes.includes("tour_surfaces") || scopes.includes("header_actions") || scopes.includes("activity")) {
        dispatchOpportunityQueueUpdated(id, key);
        return;
    }

    if (scopes.includes("documents")) {
        window.dispatchEvent(new CustomEvent("adminv2:opportunity-updated", { detail: queueDetail }));
    }
}
