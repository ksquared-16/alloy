/**
 * THE PROPOSAL AN OPERATOR REVIEWS AND CORRECTS — server side of Processing "Edit".
 *
 * `loadProposedValues` returns, per subject (parent, child, lead), each editable field's SUBMITTED value
 * (the resolution's provisional value — what the intake said) beside its CURRENT value (with the
 * operator's correction, if any) and who corrected it. `saveProposedValueEdits` validates and
 * normalizes corrections and stores them in `metadata.operator_value_edits_v1`
 * (operatorValueEdits.ts); approve applies them. Only an open, live case can be corrected.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { FormIntakeMeta } from "@/lib/forms/intake/formLeadCaptureTypes";
import { formIntakeLocationId } from "../formIntakeShadowHelpers";
import { listProcessingResolutionsByCase } from "../processingResolutionsDb";
import {
    EDITABLE_FIELDS,
    mergeOperatorValueEdits,
    normalizeEditValue,
    OPERATOR_VALUE_EDITS_KEY,
    readOperatorValueEdits,
    type EditableField,
} from "./operatorValueEdits";
import { pickLatestResolutionPerSubject, roleFromSubjectRole } from "./recommendationBuilder";

const OPEN_STATUSES = new Set(["received", "processing", "needs_review", "needs_resolution", "ready"]);

export type ProposedField = EditableField & {
    submitted: string | null;
    current: string | null;
    edited: { by: string | null; at: string } | null;
};
export type ProposedSubject = { ref: string; role: string; title: string; fields: ProposedField[] };
export type ProposedValues = {
    caseId: string;
    editable: boolean;
    subjects: ProposedSubject[];
    locations: Array<{ id: string; name: string }>;
};

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function loadContext(supabase: SupabaseClient, orgId: string, caseId: string) {
    const { data: row, error } = await supabase
        .from("processing_cases")
        .select("id, status, metadata, processing_case_subject_removed")
        .eq("org_id", orgId)
        .eq("id", caseId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const c = row as { status: string; metadata?: Record<string, unknown> | null; processing_case_subject_removed?: boolean | null };
    const resolutions = pickLatestResolutionPerSubject(await listProcessingResolutionsByCase(supabase, orgId, caseId));
    const { data: locs, error: locError } = await supabase
        .from("locations")
        .select("id, label")
        .eq("org_id", orgId)
        .eq("location_type", "site")
        .order("label", { ascending: true });
    if (locError) throw new Error(locError.message);
    return {
        status: c.status,
        metadata: c.metadata ?? {},
        removed: c.processing_case_subject_removed === true,
        resolutions,
        locations: ((locs ?? []) as Array<{ id: string; label: string | null }>).map((l) => ({ id: l.id, name: l.label ?? "Location" })),
    };
}

export async function loadProposedValues(supabase: SupabaseClient, input: { orgId: string; caseId: string }): Promise<ProposedValues | null> {
    const ctx = await loadContext(supabase, input.orgId, input.caseId);
    if (!ctx) return null;
    const edits = readOperatorValueEdits(ctx.metadata);
    const intakeMeta = ctx.metadata.intake_meta as FormIntakeMeta | undefined;
    const subjects: ProposedSubject[] = [];
    let childIndex = 0;
    for (const r of ctx.resolutions) {
        const role = roleFromSubjectRole(r.subject_role);
        const fields = EDITABLE_FIELDS[role];
        if (!fields) continue;
        const own = edits[r.subject_ref]?.values ?? {};
        const provisional = r.provisional ?? {};
        const out: ProposedField[] = fields.map((f) => {
            let submitted = s(provisional[f.key]);
            if (f.key === "location_id" && !submitted && intakeMeta && typeof intakeMeta === "object") submitted = s(formIntakeLocationId(intakeMeta));
            const edit = own[f.key];
            return { ...f, submitted, current: edit ? edit.value : submitted, edited: edit ? { by: edit.actor_id, at: edit.at } : null };
        });
        const name = [out.find((x) => x.key === "first_name")?.current, out.find((x) => x.key === "last_name")?.current].filter(Boolean).join(" ");
        const title = role === "parent" ? `Parent${name ? ` · ${name}` : ""}` : role === "child" ? `Child ${++childIndex}${name ? ` · ${name}` : ""}` : "Lead";
        subjects.push({ ref: r.subject_ref, role, title, fields: out });
    }
    const order: Record<string, number> = { parent: 0, child: 1, lead: 2 };
    subjects.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
    return { caseId: input.caseId, editable: OPEN_STATUSES.has(ctx.status) && !ctx.removed, subjects, locations: ctx.locations };
}

export type SaveEditsResult =
    | { ok: true; values: ProposedValues }
    | { ok: false; status: number; code: string; message: string; field?: { subjectRef: string; key: string } };

export async function saveProposedValueEdits(
    supabase: SupabaseClient,
    input: { orgId: string; caseId: string; actorId: string | null; edits: Array<{ subjectRef: string; field: string; value: unknown }>; now?: Date },
): Promise<SaveEditsResult> {
    if (!Array.isArray(input.edits) || input.edits.length === 0) return { ok: false, status: 400, code: "no_edits", message: "Nothing to change." };
    const ctx = await loadContext(supabase, input.orgId, input.caseId);
    if (!ctx) return { ok: false, status: 404, code: "not_found", message: "Case not found." };
    if (!OPEN_STATUSES.has(ctx.status)) return { ok: false, status: 409, code: "case_closed", message: "This case is closed; its values can no longer be changed." };
    if (ctx.removed) return { ok: false, status: 409, code: "processing_subject_removed", message: "The family or child this paperwork was for no longer exists." };
    const allowedLocations = new Set(ctx.locations.map((l) => l.id));
    const at = (input.now ?? new Date()).toISOString();
    let edits = readOperatorValueEdits(ctx.metadata);
    for (const e of input.edits) {
        const resolution = ctx.resolutions.find((r) => r.subject_ref === e.subjectRef);
        if (!resolution) return { ok: false, status: 400, code: "unknown_subject", message: "That subject is not part of this case." };
        const role = roleFromSubjectRole(resolution.subject_role);
        const field = EDITABLE_FIELDS[role]?.find((f) => f.key === e.field);
        if (!field) return { ok: false, status: 400, code: "field_not_editable", message: "That value cannot be changed here." };
        const normalized = normalizeEditValue(field, e.value, allowedLocations);
        if (!normalized.ok) return { ok: false, status: 422, code: "invalid_value", message: normalized.message, field: { subjectRef: e.subjectRef, key: e.field } };
        let submitted: unknown = (resolution.provisional ?? {})[field.key] ?? null;
        if (field.key === "location_id" && !submitted) {
            const meta = ctx.metadata.intake_meta as FormIntakeMeta | undefined;
            submitted = meta && typeof meta === "object" ? formIntakeLocationId(meta) : null;
        }
        edits = mergeOperatorValueEdits({ existing: edits, subjectRef: e.subjectRef, role, field: field.key, value: normalized.value, submitted, actorId: input.actorId, at });
    }
    const metadata = { ...ctx.metadata, [OPERATOR_VALUE_EDITS_KEY]: edits };
    const { data: updated, error } = await supabase
        .from("processing_cases")
        .update({ metadata })
        .eq("org_id", input.orgId)
        .eq("id", input.caseId)
        .in("status", [...OPEN_STATUSES])
        .select("id");
    if (error) throw new Error(error.message);
    if (!Array.isArray(updated) || updated.length !== 1) return { ok: false, status: 409, code: "case_closed", message: "This case was closed in the meantime." };
    const values = await loadProposedValues(supabase, { orgId: input.orgId, caseId: input.caseId });
    return { ok: true, values: values! };
}
