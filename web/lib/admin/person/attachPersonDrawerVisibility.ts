import type { SupabaseClient } from "@supabase/supabase-js";
import { batchOptionItemLabelsForOrg } from "@/lib/admin/optionItemLabelForOrg";
import { resolveStatusLabel } from "@/lib/admin/statusDefinitionsResolve";
import type {
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
    PersonHouseholdAdultLinkRow,
    PersonHouseholdChildLinkRow,
    PersonSiblingLinkRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";

type AdminSupabase = SupabaseClient;

const PARENT_ROLE_KEYS = new Set(["parent", "primary_contact", "primary"]);
const GUARDIAN_ROLE_KEYS = new Set(["guardian"]);
const EMERGENCY_ROLE_KEYS = new Set(["emergency_contact", "emergency"]);
const PERSON_VISIBILITY_LIMIT = 25;

function normRoleKey(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
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

/**
 * Read-only person drawer visibility payloads (enrollment mirror, opportunity mirror, siblings).
 * OCM remains operational authority — this only projects existing rows for display.
 */
export async function attachPersonDrawerVisibility(
    supabase: AdminSupabase,
    orgId: string,
    personId: string,
    out: Record<string, unknown>
): Promise<void> {
    const memberRows =
        (out._compatibility_members as {
            id: string;
            customer_id?: string | null;
            display_name?: string | null;
            relationship?: string | null;
            person_id?: string | null;
        }[]) ?? [];

    const memberIds = memberRows.map((m) => m.id).filter(Boolean);
    const customerIdsFromMembers = [...new Set(memberRows.map((m) => trimOrNull(m.customer_id)).filter(Boolean))] as string[];
    const customerIdsFromCp = [
        ...new Set(
            ((out._customer_persons as { customer_id?: string }[]) ?? [])
                .map((r) => trimOrNull(r.customer_id))
                .filter(Boolean)
        ),
    ] as string[];
    const householdCustomerIds = [...new Set([...customerIdsFromMembers, ...customerIdsFromCp])];

    const enrollmentMirror: PersonEnrollmentMirrorRow[] = [];
    if (memberIds.length > 0) {
        const { data: ocmRows } = await supabase
            .from("opportunity_customer_members")
            .select(
                "id, opportunity_id, customer_member_id, location_id, desired_program_type, program_room_cohort_key, outcome_status_key"
            )
            .eq("org_id", orgId)
            .in("customer_member_id", memberIds)
            .order("updated_at", { ascending: false })
            .limit(PERSON_VISIBILITY_LIMIT);

        const ocmList = ocmRows ?? [];
        const oppIds = [...new Set(ocmList.map((r: { opportunity_id: string }) => r.opportunity_id))];
        const locIds = [
            ...new Set(
                ocmList
                    .flatMap((r: { location_id?: string | null; program_room_cohort_key?: string | null }) => [
                        trimOrNull(r.location_id),
                        trimOrNull(r.program_room_cohort_key),
                    ])
                    .filter(Boolean)
            ),
        ] as string[];

        const [oppRes, locRes] = await Promise.all([
            oppIds.length > 0
                ? supabase
                      .from("opportunities")
                      .select("id, name, status_key")
                      .eq("org_id", orgId)
                      .in("id", oppIds)
                : { data: [] as { id: string; name?: string | null; status_key?: string | null }[] },
            locIds.length > 0
                ? supabase
                      .from("locations")
                      .select("id, label, address1, city, postal_code")
                      .eq("org_id", orgId)
                      .in("id", locIds)
                : { data: [] as { id: string; label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null }[] },
        ]);

        const oppById = new Map((oppRes.data ?? []).map((o) => [o.id, o]));
        const locById = new Map((locRes.data ?? []).map((l) => [l.id, l]));
        const memberNameById = new Map(memberRows.map((m) => [m.id, trimOrNull(m.display_name)]));

        const programPairs = ocmList.map((r: { desired_program_type?: string | null }) => ({
            setKey: "childcare_program_type",
            itemKey: r.desired_program_type,
        }));
        const programLabels = await batchOptionItemLabelsForOrg(supabase, orgId, programPairs);

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
            const opp = oppById.get(ocm.opportunity_id);
            const siteId = trimOrNull(ocm.location_id);
            const roomKey = trimOrNull(ocm.program_room_cohort_key);
            const siteRow = siteId ? locById.get(siteId) : undefined;
            const roomRow = roomKey ? locById.get(roomKey) : undefined;
            const programKey = trimOrNull(ocm.desired_program_type);
            const programLabel = programKey
                ? programLabels.get(`childcare_program_type\0${programKey}`) ?? programKey
                : null;
            const outcomeKey = trimOrNull(ocm.outcome_status_key);

            enrollmentMirror.push({
                id: ocm.id,
                opportunity_id: ocm.opportunity_id,
                opportunity_name: trimOrNull(opp?.name),
                opportunity_status_key: trimOrNull(opp?.status_key),
                opportunity_status_label: opp?.status_key
                    ? await resolveStatusLabel(supabase, orgId, "opportunities", opp.status_key)
                    : null,
                customer_member_id: ocm.customer_member_id,
                child_display_name: memberNameById.get(ocm.customer_member_id) ?? null,
                location_label: siteRow ? locationDisplayLabel(siteRow) : null,
                program_label: programLabel,
                room_label: roomRow ? locationDisplayLabel(roomRow) : roomKey,
                outcome_status_key: outcomeKey,
                outcome_status_label: outcomeKey
                    ? await resolveStatusLabel(supabase, orgId, "opportunity_customer_members", outcomeKey)
                    : null,
            });
        }
    }

    const enrollmentOpportunities: PersonEnrollmentOpportunityRow[] = [];
    const seenOpp = new Set<string>();

    const primaryOpps =
        (out._linked_opportunities as {
            id: string;
            name?: string | null;
            status_key?: string | null;
        }[]) ?? [];
    for (const opp of primaryOpps) {
        if (!opp.id || seenOpp.has(opp.id)) continue;
        seenOpp.add(opp.id);
        const sk = trimOrNull(opp.status_key);
        enrollmentOpportunities.push({
            opportunity_id: opp.id,
            opportunity_name: trimOrNull(opp.name),
            status_key: sk,
            status_label: sk ? await resolveStatusLabel(supabase, orgId, "opportunities", sk) : null,
            role_label: "Primary contact",
            link_source: "primary_person",
        });
    }

    const { data: oppPersonRows } = await supabase
        .from("opportunity_persons")
        .select("id, opportunity_id, role_type")
        .eq("org_id", orgId)
        .eq("person_id", personId)
        .order("created_at", { ascending: false })
        .limit(PERSON_VISIBILITY_LIMIT);

    const oppPersonList = oppPersonRows ?? [];
    const oppPersonOppIds = [...new Set(oppPersonList.map((r: { opportunity_id: string }) => r.opportunity_id))];
    const roleKeys = [...new Set(oppPersonList.map((r: { role_type?: string | null }) => trimOrNull(r.role_type)).filter(Boolean))] as string[];

    const [oppPersonOppsRes, roleTypesRes] = await Promise.all([
        oppPersonOppIds.length > 0
            ? supabase.from("opportunities").select("id, name, status_key").eq("org_id", orgId).in("id", oppPersonOppIds)
            : { data: [] as { id: string; name?: string | null; status_key?: string | null }[] },
        roleKeys.length > 0
            ? supabase.from("customer_person_role_types").select("key, label").eq("org_id", orgId).in("key", roleKeys)
            : { data: [] as { key: string; label: string | null }[] },
    ]);
    const oppPersonOppById = new Map((oppPersonOppsRes.data ?? []).map((o) => [o.id, o]));
    const roleLabelByKey = new Map((roleTypesRes.data ?? []).map((r) => [r.key, r.label ?? r.key]));

    for (const row of oppPersonList) {
        const r = row as { opportunity_id: string; role_type?: string | null };
        if (!r.opportunity_id || seenOpp.has(r.opportunity_id)) continue;
        seenOpp.add(r.opportunity_id);
        const opp = oppPersonOppById.get(r.opportunity_id);
        const sk = trimOrNull(opp?.status_key);
        const roleKey = trimOrNull(r.role_type);
        enrollmentOpportunities.push({
            opportunity_id: r.opportunity_id,
            opportunity_name: trimOrNull(opp?.name),
            status_key: sk,
            status_label: sk ? await resolveStatusLabel(supabase, orgId, "opportunities", sk) : null,
            role_label: roleKey ? (roleLabelByKey.get(roleKey) ?? roleKey) : null,
            link_source: "opportunity_person",
        });
    }

    const siblingLinks: PersonSiblingLinkRow[] = [];
    if (householdCustomerIds.length > 0) {
        const selfMemberIds = new Set(memberIds);
        const { data: siblingMemberRows } = await supabase
            .from("customer_members")
            .select("id, customer_id, display_name, relationship, person_id")
            .eq("org_id", orgId)
            .in("customer_id", householdCustomerIds)
            .eq("relationship", "child")
            .limit(PERSON_VISIBILITY_LIMIT);

        for (const row of siblingMemberRows ?? []) {
            const m = row as {
                id: string;
                customer_id: string;
                display_name?: string | null;
                person_id?: string | null;
            };
            if (selfMemberIds.has(m.id)) continue;
            if (m.person_id && m.person_id === personId) continue;
            siblingLinks.push({
                customer_member_id: m.id,
                customer_id: m.customer_id,
                person_id: trimOrNull(m.person_id),
                display_name: trimOrNull(m.display_name),
            });
        }
    }

    const householdAdultLinks: PersonHouseholdAdultLinkRow[] = [];
    const householdChildLinks: PersonHouseholdChildLinkRow[] = [];
    if (householdCustomerIds.length > 0) {
        const [adultCpRes, childMemberRes] = await Promise.all([
            supabase
                .from("customer_persons")
                .select("person_id, customer_id, role_type, is_primary")
                .eq("org_id", orgId)
                .in("customer_id", householdCustomerIds)
                .neq("person_id", personId)
                .limit(PERSON_VISIBILITY_LIMIT),
            supabase
                .from("customer_members")
                .select("id, customer_id, display_name, relationship, person_id")
                .eq("org_id", orgId)
                .in("customer_id", householdCustomerIds)
                .eq("relationship", "child")
                .limit(PERSON_VISIBILITY_LIMIT),
        ]);

        const adultRows = adultCpRes.data ?? [];
        const adultPersonIds = [...new Set(adultRows.map((r: { person_id: string }) => r.person_id))];
        const adultRoleKeys = [
            ...new Set(
                adultRows
                    .map((r: { role_type?: string | null }) => trimOrNull(r.role_type))
                    .filter(Boolean)
            ),
        ] as string[];

        const [adultPersonsRes, adultRoleTypesRes] = await Promise.all([
            adultPersonIds.length > 0
                ? supabase
                      .from("persons")
                      .select("id, first_name, last_name, full_name")
                      .eq("org_id", orgId)
                      .in("id", adultPersonIds)
                : { data: [] as { id: string; first_name?: string | null; last_name?: string | null; full_name?: string | null }[] },
            adultRoleKeys.length > 0
                ? supabase
                      .from("customer_person_role_types")
                      .select("key, label")
                      .eq("org_id", orgId)
                      .in("key", adultRoleKeys)
                : { data: [] as { key: string; label: string | null }[] },
        ]);

        const adultNameById = new Map(
            (adultPersonsRes.data ?? []).map((p: { id: string; first_name?: string | null; last_name?: string | null; full_name?: string | null }) => [
                p.id,
                trimOrNull(p.full_name) ||
                    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
                    null,
            ])
        );
        const adultRoleLabelByKey = new Map(
            (adultRoleTypesRes.data ?? []).map((r: { key: string; label: string | null }) => [r.key, r.label ?? r.key])
        );

        const seenAdults = new Set<string>();
        for (const row of adultRows) {
            const a = row as {
                person_id: string;
                customer_id: string;
                role_type?: string | null;
                is_primary?: boolean | null;
            };
            const dedupeKey = `${a.customer_id}:${a.person_id}:${normRoleKey(a.role_type)}`;
            if (seenAdults.has(dedupeKey)) continue;
            seenAdults.add(dedupeKey);
            const roleKey = trimOrNull(a.role_type);
            householdAdultLinks.push({
                person_id: a.person_id,
                customer_id: a.customer_id,
                display_name: adultNameById.get(a.person_id) ?? null,
                role_type: roleKey,
                role_label: roleKey ? (adultRoleLabelByKey.get(roleKey) ?? roleKey) : null,
                is_primary: Boolean(a.is_primary),
            });
        }

        const selfMemberIds = new Set(memberIds);
        for (const row of childMemberRes.data ?? []) {
            const m = row as {
                id: string;
                customer_id: string;
                display_name?: string | null;
                person_id?: string | null;
            };
            if (selfMemberIds.has(m.id)) continue;
            if (m.person_id && m.person_id === personId) continue;
            householdChildLinks.push({
                customer_member_id: m.id,
                customer_id: m.customer_id,
                person_id: trimOrNull(m.person_id),
                display_name: trimOrNull(m.display_name),
            });
        }
    }

    out._enrollment_mirror = enrollmentMirror;
    out._enrollment_opportunities = enrollmentOpportunities;
    out._sibling_links = siblingLinks;
    out._household_adult_links = householdAdultLinks;
    out._household_child_links = householdChildLinks;
    out._opportunity_person_roles = (oppPersonList as { role_type?: string | null }[]).map((r) => ({
        role_type: r.role_type ?? null,
    }));
}
