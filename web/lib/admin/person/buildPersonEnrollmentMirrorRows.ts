import type { SupabaseClient } from "@supabase/supabase-js";
import { batchOptionItemLabelsForOrg } from "@/lib/admin/optionItemLabelForOrg";
import { resolveInquiryChildProgramCategoryLabel } from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";
import { resolveStatusLabel } from "@/lib/admin/statusDefinitionsResolve";
import type { PersonEnrollmentMirrorRow } from "@/lib/admin/person/personDrawerVisibilityTypes";

const PERSON_VISIBILITY_LIMIT = 25;

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

/** School/site on inquiry child: OCM first, then opportunity default location. */
export function resolveEnrollmentMirrorSiteLocationId(
    ocmLocationId: string | null | undefined,
    opportunityLocationId: string | null | undefined
): string | null {
    return trimOrNull(ocmLocationId) || trimOrNull(opportunityLocationId);
}

function locationDisplayLabel(row: {
    label?: string | null;
    address1?: string | null;
    city?: string | null;
    postal_code?: string | null;
}): string | null {
    return (
        trimOrNull(row.label) ||
        [row.address1, row.city, row.postal_code].filter(Boolean).join(", ").trim() ||
        null
    );
}

/** Project OCM rows into `_enrollment_mirror` entries for household child member ids. */
export async function buildPersonEnrollmentMirrorRowsForMemberIds(
    supabase: SupabaseClient,
    orgId: string,
    memberIds: string[],
    memberDisplayById: Map<string, string | null>
): Promise<PersonEnrollmentMirrorRow[]> {
    const ids = [...new Set(memberIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return [];

    const { data: ocmRows } = await supabase
        .from("opportunity_customer_members")
        .select(
            "id, opportunity_id, customer_member_id, location_id, desired_program_type, program_room_cohort_key, outcome_status_key"
        )
        .eq("org_id", orgId)
        .in("customer_member_id", ids)
        .order("updated_at", { ascending: false })
        .limit(PERSON_VISIBILITY_LIMIT);

    const ocmList = ocmRows ?? [];
    if (ocmList.length === 0) return [];

    const oppIds = [...new Set(ocmList.map((r: { opportunity_id: string }) => r.opportunity_id))];

    // Fetch opportunities and program labels in parallel (program labels are independent of opps)
    const programPairs = ocmList.map((r: { desired_program_type?: string | null }) => ({
        setKey: "childcare_program_type",
        itemKey: r.desired_program_type,
    }));
    const [oppResResult, programLabels] = await Promise.all([
        oppIds.length > 0
            ? supabase
                  .from("opportunities")
                  .select("id, name, status_key, location_id")
                  .eq("org_id", orgId)
                  .in("id", oppIds)
            : Promise.resolve({ data: [] as { id: string; name?: string | null; status_key?: string | null; location_id?: string | null }[] }),
        batchOptionItemLabelsForOrg(supabase, orgId, programPairs),
    ]);

    const oppById = new Map((oppResResult.data ?? []).map((o) => [o.id, o]));

    const locIdSet = new Set<string>();
    for (const row of ocmList) {
        const ocm = row as { location_id?: string | null; program_room_cohort_key?: string | null; opportunity_id: string };
        const siteId = resolveEnrollmentMirrorSiteLocationId(
            ocm.location_id,
            oppById.get(ocm.opportunity_id)?.location_id
        );
        if (siteId) locIdSet.add(siteId);
        const roomKey = trimOrNull(ocm.program_room_cohort_key);
        if (roomKey) locIdSet.add(roomKey);
    }
    const locIds = [...locIdSet];

    const locRes =
        locIds.length > 0
            ? await supabase
                  .from("locations")
                  .select("id, label, address1, city, postal_code")
                  .eq("org_id", orgId)
                  .in("id", locIds)
            : { data: [] as { id: string; label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null }[] };

    const locById = new Map((locRes.data ?? []).map((l) => [l.id, l]));

    // Collect unique status keys from all OCM rows, then resolve all in parallel
    // rather than one sequential await per row.
    const uniqueOppStatusKeys = [
        ...new Set(
            ocmList
                .map((r: { opportunity_id: string }) => {
                    const opp = oppById.get(r.opportunity_id);
                    return opp?.status_key ? String(opp.status_key).trim() : null;
                })
                .filter(Boolean) as string[]
        ),
    ];
    const uniqueOutcomeKeys = [
        ...new Set(
            ocmList
                .map((r: { outcome_status_key?: string | null }) => trimOrNull(r.outcome_status_key))
                .filter(Boolean) as string[]
        ),
    ];
    const [resolvedOppLabels, resolvedOutcomeLabels] = await Promise.all([
        Promise.all(uniqueOppStatusKeys.map((sk) => resolveStatusLabel(supabase, orgId, "opportunities", sk))),
        Promise.all(uniqueOutcomeKeys.map((sk) => resolveStatusLabel(supabase, orgId, "opportunity_customer_members", sk))),
    ]);
    const oppStatusLabelByKey = new Map(uniqueOppStatusKeys.map((k, i) => [k, resolvedOppLabels[i]]));
    const outcomeStatusLabelByKey = new Map(uniqueOutcomeKeys.map((k, i) => [k, resolvedOutcomeLabels[i]]));

    const mirror: PersonEnrollmentMirrorRow[] = [];
    const seenMember = new Set<string>();

    for (const row of ocmList) {
        const ocm = row as {
            id: string;
            opportunity_id: string;
            customer_member_id: string;
            location_id?: string | null;
            desired_program_type?: string | null;
            program_room_cohort_key?: string | null;
            outcome_status_key?: string | null;
        };
        const memberKey = ocm.customer_member_id;
        if (seenMember.has(memberKey)) continue;
        seenMember.add(memberKey);

        const opp = oppById.get(ocm.opportunity_id);
        const siteId = resolveEnrollmentMirrorSiteLocationId(ocm.location_id, opp?.location_id);
        const roomKey = trimOrNull(ocm.program_room_cohort_key);
        const siteRow = siteId ? locById.get(siteId) : undefined;
        const roomRow = roomKey ? locById.get(roomKey) : undefined;
        const programKey = trimOrNull(ocm.desired_program_type);
        const programLabel = resolveInquiryChildProgramCategoryLabel({
            desired_program_type: programKey,
            optionLabelLookup: programLabels,
        });
        const outcomeKey = trimOrNull(ocm.outcome_status_key);
        const oppStatusKey = opp?.status_key ? String(opp.status_key).trim() : null;

        mirror.push({
            id: ocm.id,
            opportunity_id: ocm.opportunity_id,
            opportunity_name: trimOrNull(opp?.name),
            opportunity_status_key: oppStatusKey,
            opportunity_status_label: oppStatusKey ? (oppStatusLabelByKey.get(oppStatusKey) ?? null) : null,
            customer_member_id: ocm.customer_member_id,
            child_display_name: memberDisplayById.get(ocm.customer_member_id) ?? null,
            location_id: siteId,
            location_label: siteRow ? locationDisplayLabel(siteRow) : null,
            program_label: programLabel,
            room_label: roomRow ? locationDisplayLabel(roomRow) : roomKey,
            outcome_status_key: outcomeKey,
            outcome_status_label: outcomeKey ? (outcomeStatusLabelByKey.get(outcomeKey) ?? null) : null,
        });
    }

    return mirror;
}
