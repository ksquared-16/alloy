/**
 * IdentityCommandPorts — the adapter seam between semantic identity commands and
 * canonical domain storage. Each port OWNS the physical mapping for one semantic
 * operation (RFC Decisions A/B: "command implementations own physical mapping").
 *
 * Production wiring (`createDefaultIdentityCommandPorts`) delegates to the canonical
 * server helpers and org-scoped writes. Tests inject in-memory fakes. Commands never
 * reach a physical table except through a port, and never name transitional storage
 * (OCM / process_instances) in their contract.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";
import { createEnrollmentProcessInstance } from "@/lib/process/processInstances";

export type PortContext = {
    supabase: SupabaseClient;
    orgId: string;
    actorId?: string | null;
};

export type UpsertResult = { id: string; created: boolean };

export interface IdentityCommandPorts {
    createPerson(
        ctx: PortContext,
        input: {
            first_name: string | null;
            last_name: string | null;
            email: string | null;
            phone: string | null;
            status_key_on_create?: string | null;
        },
    ): Promise<UpsertResult | null>;

    updatePerson(
        ctx: PortContext,
        input: {
            person_id: string;
            patch: Record<string, unknown>;
            expected_version?: string | null;
        },
    ): Promise<{ ok: true } | { ok: false; error: string; code?: string }>;

    createHousehold(
        ctx: PortContext,
        input: { household_name: string; vertical_id?: string | null },
    ): Promise<UpsertResult>;

    linkPersonToHousehold(
        ctx: PortContext,
        input: { person_id: string; household_id: string; role_type: string },
    ): Promise<UpsertResult>;

    createChild(
        ctx: PortContext,
        input: {
            household_id: string;
            person_id: string | null;
            display_name: string;
            first_name: string | null;
            last_name: string | null;
            dob: string | null;
            relationship: string;
        },
    ): Promise<UpsertResult>;

    updateChild(
        ctx: PortContext,
        input: {
            child_id: string;
            patch: Record<string, unknown>;
            expected_version?: string | null;
        },
    ): Promise<{ ok: true } | { ok: false; error: string; code?: string }>;

    createLead(
        ctx: PortContext,
        input: {
            household_id: string;
            primary_person_id: string;
            name: string;
            status_key: string;
            stage_key: string;
            work_unit_id: string | null;
            location_id?: string | null;
        },
    ): Promise<UpsertResult>;

    updateLead(
        ctx: PortContext,
        input: {
            lead_id: string;
            patch: Record<string, unknown>;
            expected_version?: string | null;
        },
    ): Promise<{ ok: true } | { ok: false; error: string; code?: string }>;

    linkPersonToLead(
        ctx: PortContext,
        input: {
            person_id: string;
            lead_id: string;
            role_type: string;
            role: string | null;
        },
    ): Promise<UpsertResult>;

    createProcessParticipation(
        ctx: PortContext,
        input: {
            child_id: string;
            lead_id: string;
            stage_key: string | null;
            state: string | null;
            participation: Record<string, unknown>;
        },
    ): Promise<{ id: string | null; error?: string }>;

    updateProcessParticipation(
        ctx: PortContext,
        input: {
            participation_id: string;
            patch: Record<string, unknown>;
            expected_version?: string | null;
        },
    ): Promise<{ ok: true } | { ok: false; error: string; code?: string }>;

    /** Reads an existing record's org for cross-tenant validation. Null when not found. */
    readRecordOrg(
        ctx: PortContext,
        input: { table: RecordOrgTable; id: string },
    ): Promise<string | null>;

    attachDocument(
        ctx: PortContext,
        input: {
            document_id: string;
            target_entity_type: string;
            target_entity_id: string;
            doc_type: string | null;
        },
    ): Promise<{ ok: true } | { ok: false; error: string }>;

    updateCommunicationPreferences(
        ctx: PortContext,
        input: {
            person_id: string;
            category: string;
            state: string;
            method: string | null;
            source: string | null;
        },
    ): Promise<{ ok: true } | { ok: false; error: string }>;
}

export type RecordOrgTable =
    | "persons"
    | "customers"
    | "customer_members"
    | "opportunities"
    | "documents"
    | "process_instances";

const PERSON_HOUSEHOLD_ROLE = "primary_contact" as const;

/** Production ports: canonical helpers + org-scoped writes. */
export function createDefaultIdentityCommandPorts(): IdentityCommandPorts {
    return {
        async createPerson(ctx, input) {
            return findOrCreatePersonInOrgWithMeta(ctx.supabase, {
                email: input.email,
                phone: input.phone,
                first_name: input.first_name,
                last_name: input.last_name,
                org_id: ctx.orgId,
                default_status_key_on_create: input.status_key_on_create ?? null,
            });
        },

        async updatePerson(ctx, input) {
            let q = ctx.supabase
                .from("persons")
                .update({ ...input.patch, updated_at: new Date().toISOString() })
                .eq("id", input.person_id)
                .eq("org_id", ctx.orgId);
            if (input.expected_version) q = q.eq("updated_at", input.expected_version);
            const { data, error } = await q.select("id");
            if (error) return { ok: false, error: error.message, code: error.code };
            if (!data || (Array.isArray(data) && data.length === 0)) {
                return { ok: false, error: "record_not_found_or_stale", code: "stale" };
            }
            return { ok: true };
        },

        async createHousehold(ctx, input) {
            const { data, error } = await ctx.supabase
                .from("customers")
                .insert({
                    org_id: ctx.orgId,
                    name: input.household_name,
                    ...(input.vertical_id ? { vertical_id: input.vertical_id } : {}),
                })
                .select("id")
                .single();
            if (error || !data) throw new Error(error?.message ?? "create_household_failed");
            return { id: String((data as { id: string }).id), created: true };
        },

        async linkPersonToHousehold(ctx, input) {
            const { data, error } = await ctx.supabase
                .from("customer_persons")
                .upsert(
                    {
                        org_id: ctx.orgId,
                        customer_id: input.household_id,
                        person_id: input.person_id,
                        role_type: input.role_type || PERSON_HOUSEHOLD_ROLE,
                    },
                    // Live unique: uq_customer_persons_unique (org_id, customer_id, person_id, role_type)
                    { onConflict: "org_id,customer_id,person_id,role_type", ignoreDuplicates: false },
                )
                .select("id")
                .maybeSingle();
            if (error) throw new Error(error.message);
            return { id: data ? String((data as { id: string }).id) : "", created: Boolean(data) };
        },

        async createChild(ctx, input) {
            const { data, error } = await ctx.supabase
                .from("customer_members")
                .insert({
                    org_id: ctx.orgId,
                    customer_id: input.household_id,
                    person_id: input.person_id,
                    display_name: input.display_name,
                    first_name: input.first_name,
                    last_name: input.last_name,
                    dob: input.dob,
                    relationship: input.relationship,
                })
                .select("id")
                .single();
            if (error || !data) throw new Error(error?.message ?? "create_child_failed");
            return { id: String((data as { id: string }).id), created: true };
        },

        async updateChild(ctx, input) {
            let q = ctx.supabase
                .from("customer_members")
                .update({ ...input.patch, updated_at: new Date().toISOString() })
                .eq("id", input.child_id)
                .eq("org_id", ctx.orgId);
            if (input.expected_version) q = q.eq("updated_at", input.expected_version);
            const { data, error } = await q.select("id");
            if (error) return { ok: false, error: error.message, code: error.code };
            if (!data || (Array.isArray(data) && data.length === 0)) {
                return { ok: false, error: "record_not_found_or_stale", code: "stale" };
            }
            return { ok: true };
        },

        async createLead(ctx, input) {
            const locationId =
                typeof input.location_id === "string" && input.location_id.trim()
                    ? input.location_id.trim()
                    : null;
            const { data, error } = await ctx.supabase
                .from("opportunities")
                .insert({
                    org_id: ctx.orgId,
                    customer_id: input.household_id,
                    primary_person_id: input.primary_person_id,
                    name: input.name,
                    status_key: input.status_key,
                    stage_key: input.stage_key,
                    stage_entered_at: new Date().toISOString(),
                    ...(input.work_unit_id ? { work_unit_id: input.work_unit_id } : {}),
                    ...(locationId ? { location_id: locationId } : {}),
                })
                .select("id")
                .single();
            if (error || !data) throw new Error(error?.message ?? "create_lead_failed");
            return { id: String((data as { id: string }).id), created: true };
        },

        async updateLead(ctx, input) {
            let q = ctx.supabase
                .from("opportunities")
                .update({ ...input.patch, updated_at: new Date().toISOString() })
                .eq("id", input.lead_id)
                .eq("org_id", ctx.orgId);
            if (input.expected_version) q = q.eq("updated_at", input.expected_version);
            const { data, error } = await q.select("id");
            if (error) return { ok: false, error: error.message, code: error.code };
            if (!data || (Array.isArray(data) && data.length === 0)) {
                return { ok: false, error: "record_not_found_or_stale", code: "stale" };
            }
            return { ok: true };
        },

        async linkPersonToLead(ctx, input) {
            const { data, error } = await ctx.supabase
                .from("opportunity_persons")
                .upsert(
                    {
                        org_id: ctx.orgId,
                        opportunity_id: input.lead_id,
                        person_id: input.person_id,
                        role_type: input.role_type,
                        ...(input.role ? { metadata: { role: input.role } } : {}),
                    },
                    // Live unique: uq_opportunity_persons_opp_person (opportunity_id, person_id)
                    { onConflict: "opportunity_id,person_id", ignoreDuplicates: false },
                )
                .select("id")
                .maybeSingle();
            if (error) throw new Error(error.message);
            return { id: data ? String((data as { id: string }).id) : "", created: Boolean(data) };
        },

        async createProcessParticipation(ctx, input) {
            return createEnrollmentProcessInstance(ctx.supabase, {
                orgId: ctx.orgId,
                subjectId: input.child_id,
                contextId: input.lead_id,
                stageKey: input.stage_key,
                state: (input.state as never) ?? null,
                participation: input.participation,
            });
        },

        async updateProcessParticipation(ctx, input) {
            const patch: Record<string, unknown> = {
                ...input.patch,
                updated_at: new Date().toISOString(),
            };
            if (
                Object.prototype.hasOwnProperty.call(input.patch, "stage_key") &&
                patch.stage_entered_at == null
            ) {
                patch.stage_entered_at = new Date().toISOString();
            }
            let q = ctx.supabase
                .from("process_instances")
                .update(patch)
                .eq("id", input.participation_id)
                .eq("org_id", ctx.orgId);
            if (input.expected_version) q = q.eq("updated_at", input.expected_version);
            const { data, error } = await q.select("id");
            if (error) return { ok: false, error: error.message, code: error.code };
            if (!data || (Array.isArray(data) && data.length === 0)) {
                return { ok: false, error: "record_not_found_or_stale", code: "stale" };
            }
            return { ok: true };
        },

        async readRecordOrg(ctx, input) {
            const { data } = await ctx.supabase
                .from(input.table)
                .select("org_id")
                .eq("id", input.id)
                .maybeSingle();
            const orgId = (data as { org_id?: string } | null)?.org_id;
            return typeof orgId === "string" ? orgId : null;
        },

        async attachDocument(ctx, input) {
            const { data, error } = await ctx.supabase
                .from("documents")
                .update({
                    entity_type: input.target_entity_type,
                    entity_id: input.target_entity_id,
                    ...(input.doc_type ? { doc_type: input.doc_type } : {}),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", input.document_id)
                .eq("org_id", ctx.orgId)
                .select("id");
            if (error) return { ok: false, error: error.message };
            if (!data || (Array.isArray(data) && data.length === 0)) {
                return { ok: false, error: "document_not_found" };
            }
            return { ok: true };
        },

        async updateCommunicationPreferences(ctx, input) {
            const { error } = await ctx.supabase.from("communication_preferences").upsert(
                {
                    org_id: ctx.orgId,
                    person_id: input.person_id,
                    category: input.category,
                    state: input.state,
                    method: input.method,
                    source: input.source ?? "processing_identity",
                    updated_by_user_id: ctx.actorId ?? null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "org_id,person_id,category", ignoreDuplicates: false },
            );
            if (error) return { ok: false, error: error.message };
            return { ok: true };
        },
    };
}
