import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    allowListIsImpossible,
    resolveSearchAccessEnvelope,
} from "@/lib/search/searchAccessEnvelope";
import {
    deriveChildRecordState,
    type ChildRecordState,
} from "@/lib/adminV2/records/childEnrollmentState";
import {
    isChildCohortKey,
    queryChildCohortPage,
    type ChildCohortKey,
} from "@/lib/adminV2/records/childCohortQuery";
import {
    documentActorFromAdminParts,
    projectResolvedProfilePhotosOntoRows,
} from "@/lib/documents/projectPersonProfilePhotos";

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
 *
 * ── COHORT MEMBERSHIP IS SERVER-OWNED ──
 *
 * The COHORT is a request parameter, not a client-side filter over whatever page happened to load.
 * V1 shipped it the wrong way round and an Enrolled child alphabetically beyond the first page
 * silently vanished from the Enrolled cohort. `queryChildCohortPage` owns the order —
 * scope → site → cohort → search → ordering → pagination — and the totals it returns describe the
 * whole cohort, never the page.
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
    /**
     * The record's enrollment state, from BOTH governed participation and the durable care
     * relationship. Null = "on record", a complete answer rather than a gap.
     * @see web/lib/adminV2/records/childEnrollmentState.ts
     */
    participationState: ChildRecordState;
    participationStageKey: string | null;
    /** Committed site, when placement truth exists. Never inferred from a stale opportunity. */
    siteLocationId: string | null;
    siteLocationLabel: string | null;
    /**
     * Actor-scoped canonical profile photo, from the SAME projection Work Views, Search and the
     * Focus Panel read (`persons.metadata.profile_photo_document_id` →
     * `projectResolvedProfilePhotosOntoRows`). Null when no photo exists or the child has no person
     * row — the avatar degrades to initials, never to a broken image.
     */
    photoUrl: string | null;
};

/**
 * How many rows one Records page holds — a PAGE size, not a cap on the cohort.
 *
 * The difference is the whole fix: membership is decided server-side over the full population, and
 * this only bounds how many of the qualifying records travel at once. The response carries the
 * cohort's true total so the surface can say so.
 */
const PAGE_LIMIT = 100;

function emptyPage(cohort: string) {
    return NextResponse.json({
        ok: true,
        children: [],
        cohort,
        total: 0,
        hasMore: false,
        nextOffset: null,
    });
}

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);
    const rawCohort = (searchParams.get("cohort") ?? "all").trim();
    // An unknown cohort is refused rather than silently widened to All — answering a question the
    // caller did not ask is how a cohort surface stops meaning anything.
    if (!isChildCohortKey(rawCohort)) {
        return NextResponse.json(
            { ok: false, error: "UNKNOWN_COHORT", message: `Unknown cohort "${rawCohort}"` },
            { status: 400 }
        );
    }
    const cohort: ChildCohortKey = rawCohort;
    const siteLocationId = (searchParams.get("site_location_id") ?? "").trim() || null;
    const search = (searchParams.get("q") ?? "").trim() || null;
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? PAGE_LIMIT) || PAGE_LIMIT, 1), PAGE_LIMIT);
    const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);

    const supabase = createAdminClient();

    try {
        const envelope = await resolveSearchAccessEnvelope(
            supabase,
            ctx.orgId,
            scopeDimensionsFromAccess(access)
        );
        // The operator can reach nothing: an empty population is the honest answer, not an error.
        if (envelope.impossible) return emptyPage(cohort);
        if (envelope.restricted && allowListIsImpossible(envelope.allowedCustomerIds)) {
            return emptyPage(cohort);
        }

        const page = await queryChildCohortPage({
            supabase,
            orgId: ctx.orgId,
            cohort,
            allowedCustomerIds: envelope.restricted ? (envelope.allowedCustomerIds ?? null) : null,
            siteLocationId,
            search,
            limit,
            offset,
        });

        if (page.memberIds.length === 0) {
            return NextResponse.json({
                ok: true,
                children: [],
                cohort,
                total: page.total,
                hasMore: page.hasMore,
                nextOffset: page.nextOffset,
                limit,
                offset,
            });
        }

        // Hydrate ONLY this page. The cohort decided WHO; this decides what to show about them.
        const { data, error } = await supabase
            .from("customer_members")
            .select("id, person_id, customer_id, display_name, first_name, last_name, dob, is_active")
            .eq("org_id", ctx.orgId)
            .in("id", page.memberIds);
        if (error) throw new Error(error.message);

        const byId = new Map(
            ((data ?? []) as {
                id: string;
                person_id: string | null;
                customer_id: string | null;
                display_name: string | null;
                first_name: string | null;
                last_name: string | null;
                dob: string | null;
                is_active: boolean | null;
            }[]).map((r) => [r.id, r])
        );
        // Preserve the cohort's order — the hydration query returns rows in whatever order it likes,
        // and re-sorting here would be a second ordering authority that can disagree with paging.
        const rows = page.memberIds.map((id) => byId.get(id)).filter(Boolean) as {
            id: string;
            person_id: string | null;
            customer_id: string | null;
            display_name: string | null;
            first_name: string | null;
            last_name: string | null;
            dob: string | null;
            is_active: boolean | null;
        }[];

        const householdIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
        const memberIds = rows.map((r) => r.id);

        const [householdsRes, participationRes, placementsRes, agreementsRes] = await Promise.all([
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
            // The durable care relationship. A directly enrolled child has one of these and NO
            // process instance, so reading participation alone would call them "on record".
            supabase
                .from("child_enrollment_agreements")
                .select("customer_member_id, status")
                .eq("org_id", ctx.orgId)
                .in("customer_member_id", memberIds),
        ]);

        const householdNameById = new Map(
            ((householdsRes.data ?? []) as { id: string; name: string | null }[]).map((h) => [h.id, h.name])
        );

        const participationByMember = new Map<string, { state: string | null; stage_key: string | null }>();
        // ALL states per member, not just the first: state derivation weighs them together, and a
        // child can carry both a closed journey and a running one.
        const processStatesByMember = new Map<string, string[]>();
        for (const p of (participationRes.data ?? []) as {
            subject_id: string;
            state: string | null;
            stage_key: string | null;
        }[]) {
            if (!participationByMember.has(p.subject_id)) {
                participationByMember.set(p.subject_id, { state: p.state, stage_key: p.stage_key });
            }
            processStatesByMember.set(p.subject_id, [
                ...(processStatesByMember.get(p.subject_id) ?? []),
                p.state ?? "",
            ]);
        }

        const agreementStatusesByMember = new Map<string, string[]>();
        for (const a of (agreementsRes.data ?? []) as {
            customer_member_id: string | null;
            status: string | null;
        }[]) {
            const id = (a.customer_member_id ?? "").trim();
            if (!id) continue;
            agreementStatusesByMember.set(id, [
                ...(agreementStatusesByMember.get(id) ?? []),
                a.status ?? "",
            ]);
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

        /*
         * Canonical avatars, resolved once for the page. The projection is keyed on `person_id`
         * and injects `resolved_photo_url` — the exact keys the Focus Panel's identity adapter
         * reads — so the same child resolves the same photo here, in Search, and on the card.
         */
        const rowsWithPhotos = await projectResolvedProfilePhotosOntoRows({
            supabase,
            orgId: ctx.orgId,
            actor: documentActorFromAdminParts({
                ok: true,
                userId: ctx.userId,
                orgId: ctx.orgId,
                role: ctx.role,
                roleKeys: access.roleKeys,
                permissionKeys: access.permissionKeys,
            }),
            rows: rows as unknown as Record<string, unknown>[],
        });
        const photoByMember = new Map(
            rowsWithPhotos.map((r) => [String(r.id), (r.resolved_photo_url as string | null) ?? null]),
        );

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
                participationState: deriveChildRecordState({
                    agreementStatuses: agreementStatusesByMember.get(r.id) ?? [],
                    processStates: processStatesByMember.get(r.id) ?? [],
                }),
                participationStageKey: participation?.stage_key ?? null,
                siteLocationId: siteId,
                siteLocationLabel: siteId ? (siteLabelById.get(siteId) ?? null) : null,
                photoUrl: photoByMember.get(r.id) ?? null,
            };
        });

        return NextResponse.json({
            ok: true,
            children,
            cohort,
            total: page.total,
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
            limit,
            offset,
        });
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
