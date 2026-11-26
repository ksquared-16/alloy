/**
 * Phase 1 — canonical Person address (incl. ZIP) population from a committed intake.
 *
 * ZIP is identity, not intake: it is an ordinary canonical Person field (`/settings/fields`,
 * `field_definitions` entity_type=person). This step simply populates that existing field
 * through the canonical field system — the SAME writer the manual Create-Lead path uses
 * (`upsertFieldValuesFromBody`) — after a public-form lead commits its Person. It invents no
 * ZIP/address model: it reads whichever form fields bind to a canonical person address key
 * and writes their values onto the committed Person's `field_values`.
 *
 * Downstream (Location Fit, routing, comms) then read ZIP from the canonical field system,
 * never from Processing-specific metadata.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";

/** Canonical person address field keys (mirror createLeadAddressPersistence). */
const PERSON_ADDRESS_FIELD_KEYS = ["address_line1", "address_line2", "city", "state", "postal_code"] as const;

type FormFieldSource = { entity_type?: string; field_key?: string; shared_value_key?: string } | null | undefined;
type FormField = { id?: string; field_source?: FormFieldSource };

function trimmed(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function readSubmissionValues(caseMetadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
    const snap = (caseMetadata ?? {})["payload_snapshot"];
    if (snap && typeof snap === "object") {
        const values = (snap as { values?: unknown }).values;
        if (values && typeof values === "object") return values as Record<string, unknown>;
        return snap as Record<string, unknown>;
    }
    return {};
}

/**
 * Populate the committed Person's canonical address field_values from the intake submission.
 * Binding-driven: maps form fields whose `field_source.field_key` is a canonical person address
 * key to the person's field_values. No-ops silently when there is no address field, no matching
 * field_definition, or no personId — never blocks the commit.
 */
export async function persistIntakePersonAddressFieldValues(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        personId: string;
        caseMetadata: Record<string, unknown> | null | undefined;
    },
): Promise<{ keys_written: string[] }> {
    if (!input.personId) return { keys_written: [] };

    const values = readSubmissionValues(input.caseMetadata);
    if (Object.keys(values).length === 0) return { keys_written: [] };

    // Resolve the published schema to read each field's canonical binding (field_source).
    const submissionId = trimmed((input.caseMetadata ?? {})["form_submission_id"]);
    let fields: FormField[] = [];
    if (submissionId) {
        const { data: sub } = await supabase
            .from("form_submissions")
            .select("form_definition_version_id")
            .eq("id", submissionId)
            .maybeSingle();
        const versionId = (sub as { form_definition_version_id?: string } | null)?.form_definition_version_id;
        if (versionId) {
            const { data: ver } = await supabase
                .from("form_definition_versions")
                .select("schema_json")
                .eq("id", versionId)
                .maybeSingle();
            const schema = (ver as { schema_json?: { fields?: FormField[] } } | null)?.schema_json;
            fields = Array.isArray(schema?.fields) ? (schema!.fields as FormField[]) : [];
        }
    }

    const addressKeys = new Set<string>(PERSON_ADDRESS_FIELD_KEYS);
    const body: Record<string, unknown> = {};
    for (const field of fields) {
        const key = trimmed(field.field_source?.field_key) || trimmed(field.field_source?.shared_value_key);
        if (!addressKeys.has(key)) continue;
        const raw = field.id ? values[field.id] : undefined;
        const value = trimmed(raw);
        if (value) body[key] = value;
    }

    // Fallback: some forms use the canonical key directly as the field id.
    for (const key of PERSON_ADDRESS_FIELD_KEYS) {
        if (body[key] === undefined) {
            const value = trimmed(values[key]);
            if (value) body[key] = value;
        }
    }

    if (Object.keys(body).length === 0) return { keys_written: [] };

    await upsertFieldValuesFromBody(supabase, input.orgId, "person", input.personId, body, []);
    return { keys_written: Object.keys(body) };
}
