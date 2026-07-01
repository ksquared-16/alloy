import type { SupabaseClient } from "@supabase/supabase-js";
import {
    lifecycleActivationBaseActionByKey,
    type LifecycleBaseActionKey,
} from "@/lib/lifecycle/lifecycleStageBaseActions";
import { loadPlatformActionDefinitionForOrg } from "@/lib/lifecycle/loadPlatformActionDefinitionForOrg";

type DefRow = {
    id: string;
    key: string;
    label: string;
    org_id: string | null;
    action_type: string;
    entity_type: string | null;
    description: string | null;
    icon: string | null;
    style: string | null;
    priority: number | null;
    payload_schema: unknown;
    workflow_id: string | null;
    is_active: boolean;
};

async function loadDefinitionByKey(
    supabase: SupabaseClient,
    orgId: string,
    key: string
): Promise<DefRow | null> {
    const row = await loadPlatformActionDefinitionForOrg(supabase, orgId, key);
    if (!row) return null;

    const { data, error } = await supabase
        .from("action_definitions")
        .select(
            "id, key, label, org_id, action_type, entity_type, description, icon, style, priority, payload_schema, workflow_id, is_active"
        )
        .eq("id", row.id)
        .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as DefRow | null) ?? null;
}

/** Resolve definition id for a lifecycle base action; org row used when label differs from platform. */
export async function ensureOrgLifecycleActionDefinition(
    supabase: SupabaseClient,
    orgId: string,
    baseActionKey: LifecycleBaseActionKey,
    operatorLabel: string,
    primaryRecordLabel = "Lead"
): Promise<string> {
    const base = lifecycleActivationBaseActionByKey(baseActionKey, primaryRecordLabel);
    if (!base) throw new Error("Unknown base action");

    const trimmed = operatorLabel.trim() || base.label;
    const platform = await loadDefinitionByKey(supabase, orgId, base.definition_key);
    if (!platform) throw new Error(`Action definition not found: ${base.definition_key}`);

    if (trimmed === platform.label && platform.org_id == null) {
        return platform.id;
    }

    const orgExisting = await loadDefinitionByKey(supabase, orgId, base.definition_key);
    if (orgExisting?.org_id === orgId) {
        if (orgExisting.label !== trimmed) {
            const { error } = await supabase
                .from("action_definitions")
                .update({ label: trimmed, updated_at: new Date().toISOString() })
                .eq("id", orgExisting.id)
                .eq("org_id", orgId);
            if (error) throw new Error(error.message);
        }
        return orgExisting.id;
    }

    const { data: inserted, error: insErr } = await supabase
        .from("action_definitions")
        .insert({
            org_id: orgId,
            key: base.definition_key,
            label: trimmed,
            description: platform.description,
            entity_type: platform.entity_type,
            action_type: platform.action_type,
            icon: platform.icon,
            style: platform.style,
            priority: platform.priority,
            payload_schema: platform.payload_schema,
            workflow_id: platform.workflow_id,
            is_active: true,
        })
        .select("id")
        .single();

    if (insErr) throw new Error(insErr.message);
    return String((inserted as { id: string }).id);
}
