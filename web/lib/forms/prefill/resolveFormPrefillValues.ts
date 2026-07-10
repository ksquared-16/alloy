import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchFkStamp } from "@/lib/forms/formLaunchFkDerivation";
import {
    collectScalarFormFieldIds,
    walkScalarFormFields,
} from "@/lib/forms/formSchemaFieldWalk";
import {
    filterPrefillMapToKnownFields,
    mergeDefinitionAndLinkPrefillMaps,
    PREFILL_SOURCE_PATH_RE,
} from "@/lib/forms/prefill/prefillFieldMap";
import { buildCanonicalPrefillFieldMap } from "@/lib/forms/prefill/canonicalPrefillMap";
import { buildRelationshipPrefillFieldMap } from "@/lib/forms/prefill/formsRelationshipPrefillMap";
import {
    CONTACT_COMPAT_SELECT,
    CUSTOMER_CANONICAL_ADMIN_SELECT,
    OPPORTUNITY_CANONICAL_ADMIN_SELECT,
    PERSON_CANONICAL_IDENTITY_SELECT,
} from "@/lib/fields/canonicalEntitySelectColumns";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

export function shouldApplyServerPrefill(linkMetadata: Record<string, unknown>): boolean {
    if (linkMetadata.prefill_enabled === false) return false;
    const mode =
        typeof linkMetadata.form_context_mode === "string" ? linkMetadata.form_context_mode.trim() : "";
    if (mode === "existing_record") return true;
    if (mode === "packet") {
        const st = typeof linkMetadata.source_entity_type === "string" ? linkMetadata.source_entity_type.trim() : "";
        const sid = typeof linkMetadata.source_entity_id === "string" ? linkMetadata.source_entity_id.trim() : "";
        return Boolean(st && sid);
    }
    return false;
}

function cellFromRow(row: Record<string, unknown> | null | undefined, col: string): unknown {
    if (!row) return undefined;
    return row[col];
}

/** ISO-ish date → YYYY-MM-DD for form date fields */
export function normalizeFormDateInput(raw: unknown): string | undefined {
    if (raw === null || raw === undefined) return undefined;
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s && !(raw instanceof Date)) return undefined;
    const d = raw instanceof Date ? raw : new Date(s);
    if (Number.isNaN(d.getTime())) {
        if (typeof raw === "string" && raw.slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/)) return raw.slice(0, 10);
        return undefined;
    }
    return d.toISOString().slice(0, 10);
}

function findScalarField(schema: FormSchemaV1, id: string): FormField | null {
    let found: FormField | null = null;
    walkScalarFormFields(schema, (f) => {
        if (f.id === id) found = f;
    });
    return found;
}

export async function resolveFormPrefillValues(
    supabase: SupabaseClient,
    orgId: string,
    linkMetadata: Record<string, unknown>,
    formDefinitionMetadata: Record<string, unknown> | null | undefined,
    schema: FormSchemaV1,
    launchFks: LaunchFkStamp
): Promise<Record<string, string | number | boolean>> {
    if (!shouldApplyServerPrefill(linkMetadata)) return {};

    // Canonical (field_source-driven) map fixes generated/manual fields whose ids don't
    // match the legacy prefill_field_map keys (e.g. a child Name/DOB bound to customer_member).
    // The explicit prefill_field_map still wins on conflicts.
    const canonical = buildCanonicalPrefillFieldMap(schema);
    const relationship = buildRelationshipPrefillFieldMap(schema);
    const explicit = mergeDefinitionAndLinkPrefillMaps(formDefinitionMetadata ?? null, linkMetadata) ?? {};
    const combined = { ...canonical, ...relationship, ...explicit };
    if (Object.keys(combined).length === 0) return {};

    const allowed = collectScalarFormFieldIds(schema);
    const map = filterPrefillMapToKnownFields(combined, allowed);
    if (Object.keys(map).length === 0) return {};

    const rootsNeeded = new Set<string>();
    for (const path of Object.values(map)) {
        const m = path.match(PREFILL_SOURCE_PATH_RE);
        if (m?.[1]) rootsNeeded.add(m[1]);
    }

    const mayNeedContactForPerson = rootsNeeded.has("person") && !launchFks.person_id;
    const needCustomerRow =
        rootsNeeded.has("customer") || rootsNeeded.has("contact") || mayNeedContactForPerson;

    let personRow: Record<string, unknown> | null = null;
    let customerRow: Record<string, unknown> | null = null;
    let memberRow: Record<string, unknown> | null = null;
    let opportunityRow: Record<string, unknown> | null = null;
    let contactRow: Record<string, unknown> | null = null;

    const needMember = rootsNeeded.has("customer_member") && !!launchFks.customer_member_id;
    const needOpp = rootsNeeded.has("opportunity") && !!launchFks.opportunity_id;

    if (needMember && launchFks.customer_member_id) {
        const { data, error } = await supabase
            .from("customer_members")
            .select("*")
            .eq("org_id", orgId)
            .eq("id", launchFks.customer_member_id)
            .maybeSingle();
        if (error) throw new Error(error.message);
        memberRow = (data as Record<string, unknown>) ?? null;
    }

    if (needOpp && launchFks.opportunity_id) {
        const { data, error } = await supabase
            .from("opportunities")
            .select(OPPORTUNITY_CANONICAL_ADMIN_SELECT)
            .maybeSingle();
        if (error) throw new Error(error.message);
        opportunityRow = (data as Record<string, unknown>) ?? null;
    }

    let customerIdForQueries = launchFks.customer_id;
    if (!customerIdForQueries && memberRow && typeof memberRow.customer_id === "string") {
        customerIdForQueries = memberRow.customer_id;
    }
    if (!customerIdForQueries && opportunityRow && typeof opportunityRow.customer_id === "string") {
        customerIdForQueries = opportunityRow.customer_id as string;
    }

    if (needCustomerRow && customerIdForQueries) {
        const { data, error } = await supabase
            .from("customers")
            .select(CUSTOMER_CANONICAL_ADMIN_SELECT)
            .eq("org_id", orgId)
            .eq("id", customerIdForQueries)
            .maybeSingle();
        if (error) throw new Error(error.message);
        customerRow = (data as Record<string, unknown>) ?? null;
    }

    if (rootsNeeded.has("contact") && customerRow) {
        const cid = typeof customerRow.primary_contact_id === "string" ? customerRow.primary_contact_id : null;
        if (cid) {
            const { data, error } = await supabase
                .from("contacts")
                .select(CONTACT_COMPAT_SELECT)
                .eq("org_id", orgId)
                .eq("id", cid)
                .maybeSingle();
            if (error) throw new Error(error.message);
            contactRow = (data as Record<string, unknown>) ?? null;
        }
    }

    if (rootsNeeded.has("person")) {
        let personId = launchFks.person_id;
        if (!personId && contactRow && typeof contactRow.person_id === "string") personId = contactRow.person_id as string;
        if (personId) {
            const { data, error } = await supabase
                .from("persons")
                .select(PERSON_CANONICAL_IDENTITY_SELECT)
                .eq("org_id", orgId)
                .eq("id", personId)
                .maybeSingle();
            if (error) throw new Error(error.message);
            personRow = (data as Record<string, unknown>) ?? null;
        }
    }

    const values: Record<string, string | number | boolean> = {};

    for (const [fieldId, path] of Object.entries(map)) {
        const m = path.match(PREFILL_SOURCE_PATH_RE);
        const root = m?.[1];
        const col = m?.[2];
        if (!root || !col) continue;

        const field = findScalarField(schema, fieldId);
        if (!field || field.type === "file_ref" || field.type === "signature" || field.type === "multiselect") {
            continue;
        }

        let raw: unknown;
        switch (root) {
            case "person":
                raw = cellFromRow(personRow, col);
                break;
            case "customer":
                raw = cellFromRow(customerRow, col);
                break;
            case "customer_member":
                raw = cellFromRow(memberRow, col);
                break;
            case "opportunity":
                raw = cellFromRow(opportunityRow, col);
                break;
            case "contact":
                raw = cellFromRow(contactRow, col);
                break;
            default:
                continue;
        }

        if (raw === undefined || raw === null || raw === "") continue;

        if (field.type === "date") {
            const d = normalizeFormDateInput(raw);
            if (d !== undefined) values[fieldId] = d;
            continue;
        }
        if (field.type === "number") {
            const n = typeof raw === "number" ? raw : Number(raw);
            if (Number.isFinite(n)) values[fieldId] = n;
            continue;
        }
        if (field.type === "boolean") {
            if (typeof raw === "boolean") values[fieldId] = raw;
            else if (raw === "true" || raw === "false") values[fieldId] = raw === "true";
            continue;
        }

        const s = typeof raw === "string" ? raw : String(raw);
        const t = s.trim();
        if (t.length > 0) values[fieldId] = t;
    }

    return values;
}
