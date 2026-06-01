import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { resolveStatusLabel } from "@/lib/admin/statusDefinitionsResolve";
import { buildPersonEnrollmentMirrorRowsForMemberIds } from "@/lib/admin/person/buildPersonEnrollmentMirrorRows";
import { customerPersonRowIsHouseholdPrimaryContact } from "@/lib/admin/person/householdPrimaryContact";
import { mergeHouseholdAdultLinks } from "@/lib/admin/person/mergeHouseholdAdultLinks";
import { personDrawerHouseholdAgeLabel } from "@/lib/admin/person/personDrawerHouseholdDisplay";
import { filterPersonDrawerHouseholdVisibilityBySiteScope } from "@/lib/admin/person/personDrawerHouseholdSiteScope";
import { viewingPersonHouseholdDisplayName } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import type {
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
    PersonHouseholdAdultLinkRow,
    PersonHouseholdChildLinkRow,
    PersonHouseholdCustomerAddressRow,
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

/**
 * Read-only person drawer visibility payloads (enrollment mirror, opportunity mirror, siblings).
 * OCM remains operational authority — this only projects existing rows for display.
 */
export type AttachPersonDrawerVisibilityOptions = {
    siteScope?: AdminAccessScopeDimensions | null;
    /** Populated in-place with ms durations for household_links, household_address, enrollment_mirror, enrollment_opportunities, and sibling_links sections. */
    payloadTiming?: Map<string, number>;
};

export async function attachPersonDrawerVisibility(
    supabase: AdminSupabase,
    orgId: string,
    personId: string,
    out: Record<string, unknown>,
    options?: AttachPersonDrawerVisibilityOptions
): Promise<void> {
    const _pt = options?.payloadTiming;
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

    const memberNameById = new Map(memberRows.map((m) => [m.id, trimOrNull(m.display_name)]));

    // ── Phase: enrollment mirror + enrollment opportunities + sibling links (parallel) ──────────
    // These three sections are all independent. Run them concurrently to cut wall-clock time.
    const primaryOpps =
        (out._linked_opportunities as { id: string; name?: string | null; status_key?: string | null }[]) ?? [];

    // _ts is reused after the parallel block for household links / address timing
    let _ts = 0;
    const _tsParallelStart = _pt ? Date.now() : 0;
    const [enrollmentMirror, enrollmentOpportunitiesResult, siblingLinksResult] = await Promise.all([
        // ── enrollment mirror ─────────────────────────────────────────────────────────────────
        (async (): Promise<PersonEnrollmentMirrorRow[]> => {
            if (memberIds.length === 0) return [];
            const ts = _pt ? Date.now() : 0;
            const result = await buildPersonEnrollmentMirrorRowsForMemberIds(supabase, orgId, memberIds, memberNameById);
            _pt?.set("enrollment_mirror", Date.now() - ts);
            return result;
        })(),

        // ── enrollment opportunities ──────────────────────────────────────────────────────────
        (async (): Promise<{ opps: PersonEnrollmentOpportunityRow[]; personRoles: { role_type: string | null }[] }> => {
            const ts = _pt ? Date.now() : 0;
            const opps: PersonEnrollmentOpportunityRow[] = [];
            const seenOpp = new Set<string>();

            // Fetch opportunity_persons rows in parallel with primary opp processing
            const { data: oppPersonRows } = await supabase
                .from("opportunity_persons")
                .select("id, opportunity_id, role_type")
                .eq("org_id", orgId)
                .eq("person_id", personId)
                .order("created_at", { ascending: false })
                .limit(PERSON_VISIBILITY_LIMIT);

            const oppPersonList = oppPersonRows ?? [];
            const oppPersonOppIds = [
                ...new Set(oppPersonList.map((r: { opportunity_id: string }) => r.opportunity_id)),
            ];
            const roleKeys = [
                ...new Set(
                    oppPersonList
                        .map((r: { role_type?: string | null }) => trimOrNull(r.role_type))
                        .filter(Boolean)
                ),
            ] as string[];

            const [oppPersonOppsRes, roleTypesRes] = await Promise.all([
                oppPersonOppIds.length > 0
                    ? supabase
                          .from("opportunities")
                          .select("id, name, status_key")
                          .eq("org_id", orgId)
                          .in("id", oppPersonOppIds)
                    : Promise.resolve({ data: [] as { id: string; name?: string | null; status_key?: string | null }[] }),
                roleKeys.length > 0
                    ? supabase
                          .from("customer_person_role_types")
                          .select("key, label")
                          .eq("org_id", orgId)
                          .in("key", roleKeys)
                    : Promise.resolve({ data: [] as { key: string; label: string | null }[] }),
            ]);
            const oppPersonOppById = new Map((oppPersonOppsRes.data ?? []).map((o) => [o.id, o]));
            const roleLabelByKey = new Map((roleTypesRes.data ?? []).map((r) => [r.key, r.label ?? r.key]));

            // Collect all unique status keys from primaryOpps + oppPersonList, then resolve in parallel
            const allOppStatusKeys = [
                ...new Set([
                    ...primaryOpps.map((o) => trimOrNull(o.status_key)).filter(Boolean),
                    ...(oppPersonOppsRes.data ?? []).map((o) => trimOrNull(o.status_key)).filter(Boolean),
                ] as string[]),
            ];
            const resolvedOppStatusLabels = await Promise.all(
                allOppStatusKeys.map((sk) => resolveStatusLabel(supabase, orgId, "opportunities", sk))
            );
            const statusLabelByKey = new Map(allOppStatusKeys.map((k, i) => [k, resolvedOppStatusLabels[i]]));

            for (const opp of primaryOpps) {
                if (!opp.id || seenOpp.has(opp.id)) continue;
                seenOpp.add(opp.id);
                const sk = trimOrNull(opp.status_key);
                opps.push({
                    opportunity_id: opp.id,
                    opportunity_name: trimOrNull(opp.name),
                    status_key: sk,
                    status_label: sk ? (statusLabelByKey.get(sk) ?? null) : null,
                    role_label: "Primary contact",
                    link_source: "primary_person",
                });
            }
            for (const row of oppPersonList) {
                const r = row as { opportunity_id: string; role_type?: string | null };
                if (!r.opportunity_id || seenOpp.has(r.opportunity_id)) continue;
                seenOpp.add(r.opportunity_id);
                const opp = oppPersonOppById.get(r.opportunity_id);
                const sk = trimOrNull(opp?.status_key);
                const roleKey = trimOrNull(r.role_type);
                opps.push({
                    opportunity_id: r.opportunity_id,
                    opportunity_name: trimOrNull(opp?.name),
                    status_key: sk,
                    status_label: sk ? (statusLabelByKey.get(sk) ?? null) : null,
                    role_label: roleKey ? (roleLabelByKey.get(roleKey) ?? roleKey) : null,
                    link_source: "opportunity_person",
                });
            }

            _pt?.set("enrollment_opportunities", Date.now() - ts);
            const personRoles = oppPersonList.map((r: { role_type?: string | null }) => ({
                role_type: trimOrNull(r.role_type),
            }));
            return { opps, personRoles };
        })(),

        // ── sibling links ─────────────────────────────────────────────────────────────────────
        (async (): Promise<PersonSiblingLinkRow[]> => {
            if (householdCustomerIds.length === 0) return [];
            const ts = _pt ? Date.now() : 0;
            const links: PersonSiblingLinkRow[] = [];
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
                links.push({
                    customer_member_id: m.id,
                    customer_id: m.customer_id,
                    person_id: trimOrNull(m.person_id),
                    display_name: trimOrNull(m.display_name),
                });
            }
            _pt?.set("sibling_links", Date.now() - ts);
            return links;
        })(),
    ]);

    const siblingLinks = siblingLinksResult;
    const enrollmentOpportunities = enrollmentOpportunitiesResult.opps;
    const enrollmentPersonRoles = enrollmentOpportunitiesResult.personRoles;
    if (_pt) _pt.set("visibility_parallel_total", Date.now() - _tsParallelStart);

    _ts = _pt ? Date.now() : 0;
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

        const rawAdultLinks: PersonHouseholdAdultLinkRow[] = [];
        const seenRoleRows = new Set<string>();
        for (const row of adultRows) {
            const a = row as {
                person_id: string;
                customer_id: string;
                role_type?: string | null;
                is_primary?: boolean | null;
            };
            const dedupeKey = `${a.customer_id}:${a.person_id}:${normRoleKey(a.role_type)}`;
            if (seenRoleRows.has(dedupeKey)) continue;
            seenRoleRows.add(dedupeKey);
            const roleKey = trimOrNull(a.role_type);
            rawAdultLinks.push({
                person_id: a.person_id,
                customer_id: a.customer_id,
                display_name: adultNameById.get(a.person_id) ?? null,
                role_type: roleKey,
                role_label: roleKey ? (adultRoleLabelByKey.get(roleKey) ?? roleKey) : null,
                is_primary: Boolean(a.is_primary),
                is_household_primary_contact: customerPersonRowIsHouseholdPrimaryContact({
                    role_type: roleKey,
                    is_primary: a.is_primary,
                }),
            });
        }

        const viewingDisplayName = viewingPersonHouseholdDisplayName(out);
        for (const row of (out._customer_persons as {
            customer_id?: string;
            person_id?: string;
            role_type?: string | null;
            is_primary?: boolean | null;
            _role_label?: string | null;
        }[]) ?? []) {
            const customerId = trimOrNull(row.customer_id);
            if (!customerId || !householdCustomerIds.includes(customerId)) continue;
            if (trimOrNull(row.person_id) !== personId) continue;
            const roleKey = trimOrNull(row.role_type);
            rawAdultLinks.push({
                person_id: personId,
                customer_id: customerId,
                display_name: viewingDisplayName,
                role_type: roleKey,
                role_label: roleKey
                    ? trimOrNull(row._role_label) ?? roleKey
                    : trimOrNull(row._role_label),
                is_primary: Boolean(row.is_primary),
                is_household_primary_contact: customerPersonRowIsHouseholdPrimaryContact(row),
            });
        }

        householdAdultLinks.push(...mergeHouseholdAdultLinks(rawAdultLinks));

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

    if (householdChildLinks.length > 0) {
        const memberIdsMissingPerson = householdChildLinks
            .filter((link) => !link.person_id)
            .map((link) => link.customer_member_id);
        if (memberIdsMissingPerson.length > 0) {
            const { data: memberPersonRows } = await supabase
                .from("customer_members")
                .select("id, person_id")
                .eq("org_id", orgId)
                .in("id", memberIdsMissingPerson);
            const personIdByMemberId = new Map(
                (memberPersonRows ?? []).map((row: { id: string; person_id?: string | null }) => [
                    row.id,
                    trimOrNull(row.person_id),
                ])
            );
            for (const link of householdChildLinks) {
                if (!link.person_id) {
                    link.person_id = personIdByMemberId.get(link.customer_member_id) ?? null;
                }
            }
        }

        const childPersonIds = [
            ...new Set(
                householdChildLinks.map((link) => link.person_id).filter((id): id is string => Boolean(id))
            ),
        ];
        if (childPersonIds.length > 0) {
            const { data: childPersonRows } = await supabase
                .from("persons")
                .select("id, date_of_birth, dob, status_key, photo_url, avatar_url")
                .eq("org_id", orgId)
                .in("id", childPersonIds);
            const personMetaById = new Map(
                (childPersonRows ?? []).map(
                    (row: {
                        id: string;
                        date_of_birth?: string | null;
                        dob?: string | null;
                        status_key?: string | null;
                        photo_url?: string | null;
                        avatar_url?: string | null;
                    }) => [row.id, row]
                )
            );
            const statusKeys = [
                ...new Set(
                    (childPersonRows ?? [])
                        .map((row: { status_key?: string | null }) => trimOrNull(row.status_key))
                        .filter((key): key is string => Boolean(key))
                ),
            ];
            const statusLabelByKey = new Map<string, string>();
            for (const statusKey of statusKeys) {
                statusLabelByKey.set(
                    statusKey,
                    (await resolveStatusLabel(supabase, orgId, "persons", statusKey)) ?? statusKey
                );
            }
            for (const link of householdChildLinks) {
                if (!link.person_id) continue;
                const meta = personMetaById.get(link.person_id);
                if (!meta) continue;
                const dob = trimOrNull(meta.date_of_birth) ?? trimOrNull(meta.dob);
                link.date_of_birth = dob;
                link.age_label = personDrawerHouseholdAgeLabel(dob);
                const statusKey = trimOrNull(meta.status_key);
                link.status_key = statusKey;
                link.status_label = statusKey ? statusLabelByKey.get(statusKey) ?? statusKey : null;
                link.photo_url = trimOrNull(meta.photo_url) ?? trimOrNull(meta.avatar_url);
            }
        }
    }

    _pt?.set("household_links", Date.now() - _ts);

    _ts = _pt ? Date.now() : 0;
    if (householdCustomerIds.length > 0) {
        const [customerRes, addressLocRes] = await Promise.all([
            supabase
                .from("customers")
                .select("id, name")
                .eq("org_id", orgId)
                .in("id", householdCustomerIds),
            supabase
                .from("locations")
                .select(
                    "id, customer_id, label, address1, address2, city, state, postal_code, is_primary"
                )
                .eq("org_id", orgId)
                .in("customer_id", householdCustomerIds)
                .eq("location_type", "address")
                .eq("is_active", true)
                .order("is_primary", { ascending: false }),
        ]);
        out._household_context = (customerRes.data ?? []).map(
            (c: { id: string; name?: string | null }) => ({
                customer_id: c.id,
                customer_name: trimOrNull(c.name),
            })
        );
        const addressByCustomer = new Map<string, PersonHouseholdCustomerAddressRow>();
        for (const row of addressLocRes.data ?? []) {
            const loc = row as {
                id: string;
                customer_id: string;
                label?: string | null;
                address1?: string | null;
                address2?: string | null;
                city?: string | null;
                state?: string | null;
                postal_code?: string | null;
            };
            const customerId = String(loc.customer_id);
            if (addressByCustomer.has(customerId)) continue;
            const line1 = trimOrNull(loc.address1);
            if (!line1 && !trimOrNull(loc.city) && !trimOrNull(loc.postal_code)) continue;
            addressByCustomer.set(customerId, {
                customer_id: customerId,
                location_id: loc.id,
                address_line1: line1,
                address_line2: trimOrNull(loc.address2),
                city: trimOrNull(loc.city),
                state: trimOrNull(loc.state),
                postal_code: trimOrNull(loc.postal_code),
                label: trimOrNull(loc.label),
            });
        }
        out._household_customer_addresses = [...addressByCustomer.values()];
    } else {
        out._household_context = [];
        out._household_customer_addresses = [];
    }

    _pt?.set("household_address", Date.now() - _ts);

    out._enrollment_opportunities = enrollmentOpportunities;
    if (siblingLinks.length > 0) {
        const siblingMemberIds = siblingLinks
            .filter((link) => !link.person_id)
            .map((link) => link.customer_member_id);
        if (siblingMemberIds.length > 0) {
            const { data: siblingMemberRows } = await supabase
                .from("customer_members")
                .select("id, person_id")
                .eq("org_id", orgId)
                .in("id", siblingMemberIds);
            const personIdByMemberId = new Map(
                (siblingMemberRows ?? []).map((row: { id: string; person_id?: string | null }) => [
                    row.id,
                    trimOrNull(row.person_id),
                ])
            );
            for (const link of siblingLinks) {
                if (!link.person_id) {
                    link.person_id = personIdByMemberId.get(link.customer_member_id) ?? null;
                }
            }
        }
    }

    const householdMemberDisplay = new Map<string, string | null>();
    for (const link of [...householdChildLinks, ...siblingLinks]) {
        householdMemberDisplay.set(link.customer_member_id, trimOrNull(link.display_name));
    }
    const extraHouseholdMemberIds = [...householdMemberDisplay.keys()].filter(
        (id) => !memberIds.includes(id)
    );
    if (extraHouseholdMemberIds.length > 0) {
        const extraMirror = await buildPersonEnrollmentMirrorRowsForMemberIds(
            supabase,
            orgId,
            extraHouseholdMemberIds,
            householdMemberDisplay
        );
        const seenMemberIds = new Set(enrollmentMirror.map((row) => row.customer_member_id));
        for (const row of extraMirror) {
            if (seenMemberIds.has(row.customer_member_id)) continue;
            seenMemberIds.add(row.customer_member_id);
            enrollmentMirror.push(row);
        }
    }

    out._sibling_links = siblingLinks;
    out._household_adult_links = householdAdultLinks;
    out._household_child_links = householdChildLinks;
    out._enrollment_mirror = enrollmentMirror;
    out._opportunity_person_roles = enrollmentPersonRoles;

    filterPersonDrawerHouseholdVisibilityBySiteScope(out, options?.siteScope ?? null);
}
