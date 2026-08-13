import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { attachPersonDrawerVisibility } from "@/lib/admin/person/attachPersonDrawerVisibility";
import { resolveStatusLabel } from "@/lib/admin/statusDefinitionsResolve";
import { buildPersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";
import {
    personDrawerRecordComposeDepthMarker,
    visibilityScopeForComposeDepth,
    type PersonDrawerVmComposeDepth,
} from "@/lib/adminV2/viewModel/drawer/person/personDrawerVmComposeDepth";

const PERSON_LIMIT = 25;

export type BuildPersonDrawerEntityPayloadResult =
    | { ok: true; record: Record<string, unknown> }
    | { ok: false; reason: "not_found" };

/**
 * Full person entity payload for drawer VM compose — mirrors GET /api/admin/entity/persons/:id
 * without HTTP. Used by Person/Child drawer VM composers only.
 */
export async function buildPersonDrawerEntityPayloadForViewModel(
    supabase: SupabaseClient,
    orgId: string,
    personId: string,
    siteScope?: AdminAccessScopeDimensions | null,
    composeDepth: PersonDrawerVmComposeDepth = "first_paint"
): Promise<BuildPersonDrawerEntityPayloadResult> {
    const id = personId.trim();
    if (!id) return { ok: false, reason: "not_found" };

    const { data: personRow, error: personErr } = await supabase
        .from("persons")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (personErr || !personRow) {
        return { ok: false, reason: "not_found" };
    }

    const out: Record<string, unknown> = { ...personRow };
    const p = personRow as { full_name?: string | null; first_name?: string | null; last_name?: string | null };
    out._person_name =
        (p.full_name && p.full_name.trim()) ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        null;
    const psk = (personRow as { status_key?: string | null }).status_key ?? null;
    out._status_display = await resolveStatusLabel(supabase, orgId, "persons", psk);

    const [cpResult, relResult, cmResult, locResult, oppResult, employmentResult] = await Promise.all([
        (async () => {
            const { data: cpRows } = await supabase
                .from("customer_persons")
                .select("id, customer_id, person_id, role_type, is_primary, created_at")
                .eq("person_id", id)
                .eq("org_id", orgId);
            const customerIds = [...new Set((cpRows ?? []).map((r: { customer_id: string }) => r.customer_id))];
            const roleKeys = [
                ...new Set(
                    (cpRows ?? []).map((r: { role_type?: string | null }) => r.role_type).filter(Boolean)
                ),
            ] as string[];
            const [customerRowsRes, roleTypesRes] = await Promise.all([
                customerIds.length > 0 ?
                    supabase.from("customers").select("id, name").in("id", customerIds).eq("org_id", orgId)
                :   { data: [] as { id: string; name: string | null }[] },
                roleKeys.length > 0 ?
                    supabase
                        .from("customer_person_role_types")
                        .select("key, label")
                        .eq("org_id", orgId)
                        .in("key", roleKeys)
                :   { data: [] as { key: string; label: string | null }[] },
            ]);
            const customerMap = new Map((customerRowsRes.data ?? []).map((c) => [c.id, c.name ?? null]));
            const roleLabelMap = new Map((roleTypesRes.data ?? []).map((r) => [r.key, r.label ?? r.key]));
            return (cpRows ?? []).map(
                (r: {
                    id: string;
                    customer_id: string;
                    person_id: string;
                    role_type?: string | null;
                    is_primary?: boolean | null;
                    created_at?: string;
                }) => ({
                    ...r,
                    is_primary: Boolean(r.is_primary),
                    _customer_name: customerMap.get(r.customer_id) ?? null,
                    _role_label: r.role_type ? (roleLabelMap.get(r.role_type) ?? r.role_type) : null,
                })
            );
        })(),
        (async () => {
            const { data: relRows } = await supabase
                .from("person_relationships")
                .select("id, from_person_id, to_person_id, relationship_type, created_at")
                .eq("org_id", orgId)
                .or(`from_person_id.eq.${id},to_person_id.eq.${id}`);
            return relRows ?? [];
        })(),
        (async () => {
            const [contactsRes, membersRes] = await Promise.all([
                supabase
                    .from("contacts")
                    .select("id, first_name, last_name, email, phone, customer_id")
                    .eq("person_id", id)
                    .eq("org_id", orgId)
                    .limit(PERSON_LIMIT),
                supabase
                    .from("customer_members")
                    .select("id, display_name, relationship, customer_id, person_id")
                    .eq("person_id", id)
                    .eq("org_id", orgId)
                    .limit(PERSON_LIMIT),
            ]);
            return { contacts: contactsRes.data ?? [], members: membersRes.data ?? [] };
        })(),
        (async () => {
            const { data: plLocRows } = await supabase
                .from("person_locations")
                .select("location_id, is_primary, relationship_type")
                .eq("person_id", id)
                .eq("org_id", orgId)
                .limit(PERSON_LIMIT);
            return plLocRows ?? [];
        })(),
        (async () => {
            const { data: oppRows } = await supabase
                .from("opportunities")
                .select("id, name, status_key, job_date, quote_total, created_at")
                .eq("primary_person_id", id)
                .eq("org_id", orgId)
                .order("created_at", { ascending: false })
                .limit(PERSON_LIMIT);
            return oppRows ?? [];
        })(),
        // Employment composes onto the canonical Person record — there is no
        // Staff entity and no Staff view model. A person with no employment
        // resolves to `never_employed`, never to an empty Staff card.
        buildPersonEmploymentComposition(supabase, orgId, id).catch(() => null),
    ]);

    out._customer_persons = cpResult;
    out._person_relationships = relResult;
    out._compatibility_contacts = cmResult.contacts;
    out._compatibility_members = cmResult.members;
    out._linked_locations = locResult;
    out._linked_opportunities = oppResult;
    out._employment = employmentResult;

    out._person_drawer_vm_compose_depth = personDrawerRecordComposeDepthMarker(composeDepth);

    await attachPersonDrawerVisibility(supabase, orgId, id, out, {
        siteScope: siteScope ?? null,
        scope: visibilityScopeForComposeDepth(composeDepth),
    });

    return { ok: true, record: out };
}
