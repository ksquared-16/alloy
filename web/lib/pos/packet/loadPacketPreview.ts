/**
 * Phase 7 — live packet responsibility PREVIEW (pre-compose). Projects the operator's in-progress
 * configuration across a representative household (or a real anchor) using the SAME projection seam the
 * participant runtime uses — so the operator sees exactly how work will land before saving. No persistence.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchEntityType } from "./launchFromEntity";
import type { RosterChild, RosterRecipient } from "./posPacketRoster";
import { loadPacketRoster } from "./posPacketRoster";
import { coerceSchema } from "./loadPacketProjection";
import { parseRequirementResponsibilityRules, type ProjectionRoster } from "./requirementResponsibility";
import {
    evaluatePacketCompletion,
    projectForParticipant,
    projectPacketResponsibilities,
    type PacketFormInput,
    type ParticipantRequirementView,
} from "./packetResponsibilityProjection";

/** A representative household for preview: two guardians (primary + financial) and two children. */
export function representativeHousehold(): ProjectionRoster {
    const gA: RosterRecipient = { person_id: "preview-guardian-a", label: "Guardian A", email: null, phone: null, relationship: "primary guardian" };
    const gB: RosterRecipient = { person_id: "preview-guardian-b", label: "Guardian B", email: null, phone: null, relationship: "financial guardian" };
    const c1: RosterChild = { customer_member_id: "preview-child-1", label: "Child One", dob: null };
    const c2: RosterChild = { customer_member_id: "preview-child-2", label: "Child Two", dob: null };
    return { children: [c1, c2], recipients: [gA, gB], primary_guardian_person_id: gA.person_id, financial_guardian_person_id: gB.person_id };
}

async function loadPublishedSchemas(supabase: SupabaseClient, orgId: string, formIds: string[]): Promise<{ forms: PacketFormInput[]; missing: string[] }> {
    const forms: PacketFormInput[] = [];
    const missing: string[] = [];
    if (formIds.length === 0) return { forms, missing };
    const { data } = await supabase
        .from("form_definition_versions")
        .select("form_definition_id, version_number, schema_json")
        .eq("org_id", orgId)
        .in("form_definition_id", formIds)
        .eq("status", "published")
        .order("version_number", { ascending: false });
    const best = new Map<string, unknown>();
    for (const row of (data ?? []) as Array<{ form_definition_id: string; schema_json: unknown }>) {
        if (!best.has(row.form_definition_id)) best.set(row.form_definition_id, row.schema_json);
    }
    for (const fid of formIds) {
        const schema = coerceSchema(best.get(fid));
        if (schema) forms.push({ form_definition_id: fid, schema });
        else missing.push(fid);
    }
    return { forms, missing };
}

export interface PacketPreviewGuardian {
    person_id: string;
    label: string;
    view: ParticipantRequirementView[];
}

export interface PacketPreviewResult {
    ok: boolean;
    error?: string;
    missing_published_forms: string[];
    launch_blocked: boolean;
    requirements: ReturnType<typeof projectPacketResponsibilities>["requirements"];
    instances: ReturnType<typeof projectPacketResponsibilities>["instances"];
    validation: ReturnType<typeof projectPacketResponsibilities>["validation"];
    household: { guardians: Array<{ person_id: string; label: string }>; children: Array<{ id: string; label: string }> };
    guardians: PacketPreviewGuardian[];
    summary: { total_required: number; complete: number; remaining: number; blocking_issues: number; warnings: number };
}

export async function loadPacketPreview(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        formIds: string[];
        requirementResponsibilities: unknown[];
        anchor?: { entity_type: LaunchEntityType; entity_id: string } | null;
    }
): Promise<PacketPreviewResult> {
    const { forms, missing } = await loadPublishedSchemas(supabase, args.orgId, Array.from(new Set(args.formIds)).filter(Boolean));
    const rules = parseRequirementResponsibilityRules({ requirement_responsibilities: args.requirementResponsibilities });

    let roster: ProjectionRoster;
    if (args.anchor) {
        const loaded = await loadPacketRoster(supabase, args.orgId, args.anchor.entity_type, args.anchor.entity_id);
        roster = {
            children: loaded.children,
            recipients: loaded.recipients,
            primary_guardian_person_id: loaded.recipients[0]?.person_id ?? null,
            financial_guardian_person_id: loaded.recipients.find((r) => /financ|billing|payer/i.test(r.relationship ?? ""))?.person_id ?? null,
        };
        if (roster.recipients.length === 0 || roster.children.length === 0) {
            // Fall back to a representative household so preview stays meaningful for thin anchors.
            roster = representativeHousehold();
        }
    } else {
        roster = representativeHousehold();
    }

    const projection = projectPacketResponsibilities({ forms, rules, roster });
    const completion = evaluatePacketCompletion(projection.instances, []);
    const guardians: PacketPreviewGuardian[] = roster.recipients.map((r) => ({
        person_id: r.person_id,
        label: r.label,
        view: projectForParticipant({ completions: completion.completions, participantId: r.person_id }),
    }));
    const requiredInstances = projection.instances.filter((i) => i.required);

    return {
        ok: true,
        missing_published_forms: missing,
        launch_blocked: projection.launch_blocked,
        requirements: projection.requirements,
        instances: projection.instances,
        validation: projection.validation,
        household: {
            guardians: roster.recipients.map((r) => ({ person_id: r.person_id, label: r.label })),
            children: roster.children.map((c) => ({ id: c.customer_member_id, label: c.label })),
        },
        guardians,
        summary: {
            total_required: requiredInstances.length,
            complete: 0,
            remaining: requiredInstances.length,
            blocking_issues: projection.validation.filter((v) => v.blocking).length,
            warnings: projection.validation.filter((v) => !v.blocking).length,
        },
    };
}
