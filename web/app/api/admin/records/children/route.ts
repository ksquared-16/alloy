import { NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    allowListIsImpossible,
    resolveSearchAccessEnvelope,
} from "@/lib/search/searchAccessEnvelope";

/**
 * Records → Children — the durable child population, read-only.
 *
 * ── THE MEMBER ROW IS THE RECORD ──
 *
 * `customer_members` is the canonical child identity (Durable Record Attention, Workstream C):
 * `display_name` is NOT NULL, identity facts live on the row, and `person_id` is NULLABLE. In the
 * certification tenant every child has a null person, so a projection keyed on `persons` would show
 * an empty Children section while 1500 children existed.
 *
 * ── THIS IS NOT AN ENROLLMENT QUEUE ──
 *
 * A child appears here because the household record exists — not because a process is running. Any
 * participation state is ENRICHMENT layered on top, and a child with none is still a full row. That
 * is the whole difference between a record surface and a work surface.
 *
 * No new persistence: every field is read from `customer_members`, `customers` and (for
 * participation) `process_instances`. Cohort membership is derived on read and never stored.
 */

export type RecordsChildEntry = {
    /** `customer_members.id` — the durable attention subject. NEVER `person_id`. */
    customerMemberId: string;
    /** May legitimately be null; the record does not depend on it. */
    personId: string | null;
    displayName: string;
    dateOfBirth: string | null;
    householdId: string | null;
    householdName: string | null;
    isActive: boolean;
    /** Canonical participation, when the platform holds any. Null = no process, which is a state. */
    participationState: "in_process" | "enrolled" | "closed" | null;
    participationStageKey: string | null;
    /** Committed site, when placement truth exists. Never inferred from a stale opportunity. */
    siteLocationId: string | null;
    siteLocationLabel: string | null;
};

/** How many rows one Records page holds. Records is for review, not for exhaustive export. */
const PAGE_LIMIT = 500;

export async function GET() {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: access.status });
    }

    const supabase = createAdminClient();

    try {
        const envelope = await resolveSearchAccessEnvelope(
            supabase,
            ctx.orgId,
            scopeDimensionsFromAccess(access)
        );
        // The operator can reach nothing: an empty population is the honest answer, not an error.
        if (envelope.impossible) return NextResponse.json({ ok: true, children: [] });

        let query = supabase
            .from("customer_members")
            .select("id, person_id, customer_id, display_name, first_name, last_name, dob, is_active")
            .eq("org_id", ctx.orgId)
            .eq("relationship", "child")
            .order("display_name")
            .limit(PAGE_LIMIT);

        if (envelope.restricted) {
            if (allowListIsImpossible(envelope.allowedCustomerIds)) {
                return NextResponse.json({ ok: true, children: [] });
            }
            if (envelope.allowedCustomerIds) {
                query = query.in("customer_id", envelope.allowedCustomerIds);
            }
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const rows = (data ?? []) as {
            id: string;
            person_id: string | null;
            customer_id: string | null;
            display_name: string | null;
            first_name: string | null;
            last_name: string | null;
            dob: string | null;
            is_active: boolean | null;
        }[];
        if (rows.length === 0) return NextResponse.json({ ok: true, children: [] });

        const householdIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
        const memberIds = rows.map((r) => r.id);

        const [householdsRes, participationRes, placementsRes] = await Promise.all([
            householdIds.length > 0
                ? supabase.from("customers").select("id, name").eq("org_id", ctx.orgId).in("id", householdIds)
                : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
            // Participation is keyed by the MEMBER — the same subject id Records opens.
            supabase
                .from("process_instances")
                .select("subject_id, process_key, state, stage_key")
                .eq("org_id", ctx.orgId)
                .eq("subject_type", "child")
                .in("subject_id", memberIds),
            // Committed placement is the authoritative site. Absent placement means NO site — never
            // fall back to a household's opportunity, which may be stale or belong to a sibling.
            // `active` only: a superseded placement records where a child USED to be.
            supabase
                .from("child_placements")
                .select("customer_member_id, site_location_id, status")
                .eq("org_id", ctx.orgId)
                .eq("status", "active")
                .in("customer_member_id", memberIds),
        ]);

        const householdNameById = new Map(
            ((householdsRes.data ?? []) as { id: string; name: string | null }[]).map((h) => [h.id, h.name])
        );

        const participationByMember = new Map<string, { state: string | null; stage_key: string | null }>();
        for (const p of (participationRes.data ?? []) as {
            subject_id: string;
            state: string | null;
            stage_key: string | null;
        }[]) {
            if (!participationByMember.has(p.subject_id)) {
                participationByMember.set(p.subject_id, { state: p.state, stage_key: p.stage_key });
            }
        }

        const siteByMember = new Map<string, string>();
        for (const pl of ((placementsRes.data ?? []) as {
            customer_member_id: string;
            site_location_id: string | null;
        }[])) {
            if (pl.site_location_id && !siteByMember.has(pl.customer_member_id)) {
                siteByMember.set(pl.customer_member_id, pl.site_location_id);
            }
        }

        const siteIds = [...new Set(siteByMember.values())];
        const siteLabelById = new Map<string, string | null>();
        if (siteIds.length > 0) {
            const { data: sites } = await supabase
                .from("locations")
                .select("id, label")
                .eq("org_id", ctx.orgId)
                .in("id", siteIds);
            for (const s of (sites ?? []) as { id: string; label: string | null }[]) {
                siteLabelById.set(s.id, s.label);
            }
        }

        const children: RecordsChildEntry[] = rows.map((r) => {
            const participation = participationByMember.get(r.id) ?? null;
            const siteId = siteByMember.get(r.id) ?? null;
            return {
                customerMemberId: r.id,
                personId: r.person_id,
                displayName:
                    (r.display_name ?? "").trim() ||
                    [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
                    "Child",
                dateOfBirth: r.dob,
                householdId: r.customer_id,
                householdName: r.customer_id ? (householdNameById.get(r.customer_id) ?? null) : null,
                isActive: r.is_active !== false,
                participationState: participationStateFrom(participation?.state ?? null),
                participationStageKey: participation?.stage_key ?? null,
                siteLocationId: siteId,
                siteLocationLabel: siteId ? (siteLabelById.get(siteId) ?? null) : null,
            };
        });

        return NextResponse.json({ ok: true, children });
    } catch (e) {
        console.error("[records-children]", e);
        return NextResponse.json(
            {
                ok: false,
                error: "LOAD_FAILED",
                message: e instanceof Error ? e.message : "Could not load children",
            },
            { status: 500 }
        );
    }
}

/**
 * `process_instances.state` → the record's participation state.
 *
 * Unknown states map to `in_process` rather than null: a running process the platform does not have
 * a word for is still participation, and calling it "no process" would hide a child from the cohort
 * that describes them. Null is reserved for genuinely absent participation.
 */
function participationStateFrom(state: string | null): RecordsChildEntry["participationState"] {
    const v = (state ?? "").trim().toLowerCase();
    if (!v) return null;
    if (v === "completed" || v === "enrolled") return "enrolled";
    if (v === "closed" || v === "cancelled" || v === "withdrawn") return "closed";
    return "in_process";
}
