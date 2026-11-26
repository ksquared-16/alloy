/**
 * BP V2 D1 — provision the opportunity drawer override an Enrollment org needs, at publication.
 *
 * ── WHY THIS EXISTS ──
 *
 * The opportunity drawer view-model gates on the org's EFFECTIVE drawer layout: unless its
 * `inquiry_drawer_mode` is `"workflow_v1"` it answers `classic_layout_deferred` and the Focus Panel never
 * opens (`sharedCanonicalDeps`). Childcare orgs that existed in April 2026 got that mode from the seed
 * migrations (20260424190000 / 20260430203000). Every org created since falls back to the global
 * `record_layouts` default (mode null), and no supported tool can create the override: the legacy
 * workflow_v1 editors refuse unless the mode is already workflow_v1, and Surfaces (`entity_layouts`)
 * never writes `record_drawer_layouts`. Diagnosis: certification/business-processes-v2/slice8b2/FOCUS-PANEL-PARITY.md.
 *
 * ── THE TRIGGER ──
 *
 * A successful publication of a department whose published configuration carries an active Enrollment
 * staged process (staged lifecycle + the family/child `tracks_v1` model only the Enrollment template
 * instantiates). The publish route calls this AFTER `publish_business_process_revision_v1` has committed,
 * beside `ensureHostsForPublishedProjections`, and with the same contract: idempotent, and a failure is
 * REPORTED on the publish response, never turned into a failed publish. A blocked or failed publication
 * never reaches it, so it leaves nothing behind; the next successful publish retries.
 *
 * ── WHAT IT WILL NOT DO ──
 *
 * It INSERTs only when the org has no override row at all (any `is_active`). An existing row — a
 * customized workflow_v1 layout, a deliberate classic one, a deactivated one, or a malformed one — is
 * classified and reported, never written. Concurrent publishes are arbitrated by the table's UNIQUE key.
 * It does not touch `entity_layouts` (Surfaces): the two are separate configuration lifecycles; this row
 * only switches the drawer into the mode the Focus Panel runtime requires.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import { persistOpportunityDrawerLayoutConfig } from "@/lib/admin/recordDrawerLayoutPersist";
import {
    ENROLLMENT_TRACK_CHILD_KEY,
    ENROLLMENT_TRACK_FAMILY_KEY,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { parseLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveProcessModel } from "@/lib/lifecycle/processModelV1";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

/**
 * The workflow_v1 drawer config the seed migrations last gave every childcare org
 * (20260430203000_childcare_opportunity_drawer_workflow_v3_layout.sql), verbatim. Later migrations
 * appended and then removed `tour_scheduling` (net zero) and renamed `inquiry_child.desired_*` keys this
 * config does not contain — so this IS the current migration-era shape. It is not any tenant's edited
 * layout: no `field_placements_v1`, no operator ordering. Changing it is a visual decision; don't.
 */
export const ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT: Readonly<RecordLayoutConfigJson> = Object.freeze({
    version: 3,
    inquiry_drawer_mode: "workflow_v1",
    suppress_body_status: true,
    overview_section_order: ["inquiry_children", "inquiry_tuition", "inquiry_source_external"],
    overview_hidden_sections: [
        "identity", "opportunity", "relationships", "booking", "quote", "promo", "inquiry", "enrollment",
        "program", "source", "tour", "follow_up", "details", "specialty_quote", "opportunity_details",
        "customer_booking", "record_info", "notes", "status", "__unified_status", "pricing", "tuition",
        "tuition_pricing", "fee_schedule", "inquiry_enrollment", "inquiry_tour_followup",
    ],
    inquiry_workflow_sections: [
        {
            key: "inquiry_source_external",
            title: "Source & external",
            field_keys: ["inquiry_source", "source", "external_source", "external_id", "discount_code", "discount_program_id"],
            default_expanded: false,
        },
    ],
});

/** Active Enrollment staged processes in a published configuration (empty → nothing to provision). */
export function publishedEnrollmentStagedProcessKeys(publishedPayload: unknown): string[] {
    const builder = parseLifecycleBuilderV1(publishedPayload);
    const keys: string[] = [];
    for (const process of builder?.processes ?? []) {
        if (!process.is_active) continue;
        if (resolveProcessModel(process).kind !== "staged_lifecycle") continue;
        const trackKeys = new Set((process.tracks_v1?.tracks ?? []).map((t) => t.key));
        if (trackKeys.has(ENROLLMENT_TRACK_FAMILY_KEY) && trackKeys.has(ENROLLMENT_TRACK_CHILD_KEY)) keys.push(process.key);
    }
    return keys;
}

/** What the org's opportunity/drawer/default override row is — read regardless of `is_active`. */
export type OpportunityDrawerOverrideState =
    | { kind: "missing" }
    | { kind: "unreadable"; error: string }
    | { kind: "invalid"; id: string; reason: string }
    | { kind: "inactive"; id: string }
    | { kind: "conflicting"; id: string; inquiry_drawer_mode: string | null }
    | { kind: "workflow_v1"; id: string };

export function classifyOpportunityDrawerOverrideRow(row: { id: string; is_active: unknown; config_json: unknown }): OpportunityDrawerOverrideState {
    const cfg = row.config_json;
    if (cfg === null || typeof cfg !== "object" || Array.isArray(cfg)) {
        return { kind: "invalid", id: row.id, reason: "config_json is not an object" };
    }
    const mode = (cfg as Record<string, unknown>).inquiry_drawer_mode;
    if (mode !== undefined && mode !== null && typeof mode !== "string") {
        return { kind: "invalid", id: row.id, reason: "inquiry_drawer_mode is not a string" };
    }
    if (row.is_active !== true) return { kind: "inactive", id: row.id };
    if (mode === "workflow_v1") return { kind: "workflow_v1", id: row.id };
    // A classic (or unknown-mode) override is a configuration someone chose; it is reported, never replaced.
    return { kind: "conflicting", id: row.id, inquiry_drawer_mode: (mode as string | null | undefined) ?? null };
}

export async function readOpportunityDrawerOverrideState(supabase: SupabaseClient, orgId: string): Promise<OpportunityDrawerOverrideState> {
    const { data, error } = await supabase
        .from("record_drawer_layouts")
        .select("id, is_active, config_json")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunity")
        .eq("surface", "drawer")
        .eq("key", "default")
        .maybeSingle();
    if (error) return { kind: "unreadable", error: error.message };
    if (!data) return { kind: "missing" };
    return classifyOpportunityDrawerOverrideRow(data as { id: string; is_active: unknown; config_json: unknown });
}

export type EnrollmentDrawerOverrideProvisioning =
    | { status: "not_applicable" }
    /** This publish created the override. */
    | { status: "provisioned"; processKeys: string[] }
    /** A workflow_v1 override already exists — left byte-identical. */
    | { status: "already_present"; processKeys: string[]; id: string }
    /** A concurrent publish created it first (UNIQUE key); not written by this call. */
    | { status: "provisioned_concurrently"; processKeys: string[]; id: string }
    /** No override, but the global default already resolves to workflow_v1 — nothing to add. */
    | { status: "not_needed"; processKeys: string[] }
    /** An override exists that is not workflow_v1, or cannot be read — reported, never overwritten. */
    | { status: "blocked"; processKeys: string[]; state: Exclude<OpportunityDrawerOverrideState, { kind: "missing" } | { kind: "workflow_v1" }> }
    | { status: "failed"; processKeys: string[]; error: string };

export async function ensureEnrollmentOpportunityDrawerOverride(
    supabase: SupabaseClient,
    args: { orgId: string; publishedPayload: unknown },
): Promise<EnrollmentDrawerOverrideProvisioning> {
    const processKeys = publishedEnrollmentStagedProcessKeys(args.publishedPayload);
    if (!processKeys.length) return { status: "not_applicable" };
    try {
        const state = await readOpportunityDrawerOverrideState(supabase, args.orgId);
        if (state.kind === "workflow_v1") return { status: "already_present", processKeys, id: state.id };
        if (state.kind !== "missing") return { status: "blocked", processKeys, state };

        const effective = await fetchEffectiveRecordDrawerLayout(supabase, args.orgId, "opportunity");
        if (!effective.ok) return { status: "blocked", processKeys, state: { kind: "unreadable", error: effective.error } };
        if (effective.layout?.config_json?.inquiry_drawer_mode === "workflow_v1") return { status: "not_needed", processKeys };

        const written = await persistOpportunityDrawerLayoutConfig(
            supabase,
            args.orgId,
            structuredClone(ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT) as RecordLayoutConfigJson,
            { onlyIfAbsent: true },
        );
        if (written.ok) return { status: "provisioned", processKeys };
        if (written.code !== "already_exists") return { status: "failed", processKeys, error: written.error };

        const after = await readOpportunityDrawerOverrideState(supabase, args.orgId);
        if (after.kind === "workflow_v1") return { status: "provisioned_concurrently", processKeys, id: after.id };
        if (after.kind === "missing") return { status: "failed", processKeys, error: written.error };
        return { status: "blocked", processKeys, state: after };
    } catch (e) {
        return { status: "failed", processKeys, error: e instanceof Error ? e.message : String(e) };
    }
}
