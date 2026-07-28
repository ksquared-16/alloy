/**
 * Load / save Surface Command Exposure using existing action_placements storage.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listEnabledCommandKeys } from "@/lib/lifecycle/processCommandSetV1";
import { resolveBusinessProcessCommandSelection } from "@/lib/lifecycle/resolveBusinessProcessCommandSelection";
import {
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderProcessRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    getPlatformCapability,
    isNonRunnableCatalogCapability,
} from "@/lib/platform/commands/capabilityRegistry";
import { commandPurpose } from "@/lib/platform/commands/commandProductPresentation";
import { getOrganizationCommandCatalogEntry } from "@/lib/platform/commands/organizationCommandCatalog";
import {
    assertSurfaceMayExposeCommand,
    buildSurfaceCommandExposureConditionConfig,
    buildSurfaceCommandExposureRows,
    surfaceCommandExposureTarget,
    surfaceCommandExposureTargetsForSection,
    type SurfaceCommandExposureCandidate,
    type SurfaceCommandExposureKind,
    type SurfaceCommandExposureRow,
} from "@/lib/adminV2/settings/surfaces/surfaceCommandExposure";
import type { SurfaceConfigSectionKey } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

export type SurfaceCommandExposureLoadResult = {
    section: SurfaceConfigSectionKey;
    process: {
        departmentId: string;
        processId: string;
        processKey: string;
        processName: string;
        authority: "command_set_v1" | "legacy_compatibility";
    } | null;
    exposures: Array<{
        kind: SurfaceCommandExposureKind;
        label: string;
        description: string;
        orderingMeaningful: boolean;
        rows: SurfaceCommandExposureRow[];
        emptyState: string;
    }>;
    emptyState: "no_process" | "ok";
};

function humanLabelForCapability(capabilityKey: string): string {
    const entry = getOrganizationCommandCatalogEntry(capabilityKey);
    if (entry?.operatorLabel?.trim()) return entry.operatorLabel.trim();
    const cap = getPlatformCapability(capabilityKey);
    if (cap?.operatorLabel?.trim()) return cap.operatorLabel.trim();
    return capabilityKey
        .split("_")
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
}

function buildCandidates(process: LifecycleBuilderProcessRecord | null): {
    candidates: SurfaceCommandExposureCandidate[];
    selectedKeys: Set<string>;
    authority: "command_set_v1" | "legacy_compatibility" | null;
} {
    if (!process) {
        return { candidates: [], selectedKeys: new Set(), authority: null };
    }
    const selection = resolveBusinessProcessCommandSelection({ process });
    const selectedKeys = new Set(listEnabledCommandKeys(selection.commands));
    const candidates: SurfaceCommandExposureCandidate[] = [];
    for (const key of selectedKeys) {
        const entry = getOrganizationCommandCatalogEntry(key);
        const supported = Boolean(getPlatformCapability(key)) && !isNonRunnableCatalogCapability(key);
        candidates.push({
            capabilityKey: key,
            label: humanLabelForCapability(key),
            purpose: entry ? commandPurpose(entry) : humanLabelForCapability(key),
            supported,
            processSelected: true,
            blockedReason: supported
                ? null
                : "Alloy does not run this Command yet. Surfaces cannot make it runnable.",
        });
    }
    return { candidates, selectedKeys, authority: selection.authority };
}

async function loadPlacementRows(
    supabase: SupabaseClient,
    orgId: string,
    capabilityKeys: readonly string[]
): Promise<
    Array<{
        id: string;
        orgOwned: boolean;
        capabilityKey: string;
        surface: string;
        slot: string;
        isActive: boolean;
        orderIndex: number;
    }>
> {
    if (!capabilityKeys.length) return [];
    const { data: defs, error: defErr } = await supabase
        .from("action_definitions")
        .select("id, key, org_id")
        .in("key", [...capabilityKeys])
        .or(`org_id.is.null,org_id.eq.${orgId}`);
    if (defErr) throw new Error(defErr.message);
    const defRows = (defs ?? []) as Array<{ id: string; key: string; org_id: string | null }>;
    if (!defRows.length) return [];

    const defIds = defRows.map((d) => d.id);
    const keyByDefId = new Map(defRows.map((d) => [d.id, d.key]));

    const { data: placements, error: plErr } = await supabase
        .from("action_placements")
        .select("id, org_id, action_definition_id, surface, slot, is_active, order_index")
        .in("action_definition_id", defIds)
        .or(`org_id.is.null,org_id.eq.${orgId}`);
    if (plErr) throw new Error(plErr.message);

    return ((placements ?? []) as Array<{
        id: string;
        org_id: string | null;
        action_definition_id: string;
        surface: string;
        slot: string;
        is_active: boolean;
        order_index: number | null;
    }>).map((p) => ({
        id: p.id,
        orgOwned: p.org_id === orgId,
        capabilityKey: keyByDefId.get(p.action_definition_id) ?? "",
        surface: p.surface,
        slot: p.slot,
        isActive: Boolean(p.is_active),
        orderIndex: typeof p.order_index === "number" ? p.order_index : 0,
    })).filter((p) => Boolean(p.capabilityKey));
}

export async function loadSurfaceCommandExposure(input: {
    supabase: SupabaseClient;
    orgId: string;
    section: SurfaceConfigSectionKey;
    departmentId?: string | null;
    processId?: string | null;
}): Promise<SurfaceCommandExposureLoadResult> {
    const targets = surfaceCommandExposureTargetsForSection(input.section);
    let process: LifecycleBuilderProcessRecord | null = null;
    let processMeta: SurfaceCommandExposureLoadResult["process"] = null;

    if (input.departmentId) {
        const { data: dept, error } = await input.supabase
            .from("departments")
            .select("id, name, metadata")
            .eq("id", input.departmentId)
            .eq("org_id", input.orgId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        const builder = dept
            ? lifecycleBuilderFromDepartmentMetadata((dept as { metadata?: unknown }).metadata)
            : null;
        if (builder) {
            const wantId = (input.processId ?? "").trim();
            process =
                (wantId
                    ? builder.processes.find((p) => p.id === wantId && p.is_active)
                    : null) ??
                builder.processes.find((p) => p.id === builder.active_process_id && p.is_active) ??
                builder.processes.find((p) => p.is_active) ??
                null;
            if (process) {
                const { authority } = resolveBusinessProcessCommandSelection({ process });
                processMeta = {
                    departmentId: String((dept as { id: string }).id),
                    processId: process.id,
                    processKey: process.key,
                    processName: process.name,
                    authority,
                };
            }
        }
    }

    // Focus Panel (Enrollment) without explicit department: prefer Enrollment-named process.
    if (!process && input.section === "focus-panels") {
        const { data: depts, error } = await input.supabase
            .from("departments")
            .select("id, name, metadata")
            .eq("org_id", input.orgId)
            .eq("is_active", true);
        if (error) throw new Error(error.message);
        for (const dept of depts ?? []) {
            const builder = lifecycleBuilderFromDepartmentMetadata(
                (dept as { metadata?: unknown }).metadata
            );
            if (!builder) continue;
            const enrollment =
                builder.processes.find(
                    (p) =>
                        p.is_active &&
                        (p.key === "enrollment" ||
                            /enrollment/i.test(p.name) ||
                            /enrollment/i.test(p.key))
                ) ?? null;
            if (!enrollment) continue;
            process = enrollment;
            const { authority } = resolveBusinessProcessCommandSelection({ process });
            processMeta = {
                departmentId: String((dept as { id: string }).id),
                processId: process.id,
                processKey: process.key,
                processName: process.name,
                authority,
            };
            break;
        }
    }

    if (!process || !processMeta) {
        return {
            section: input.section,
            process: null,
            exposures: targets.map((t) => ({
                kind: t.kind,
                label: t.label,
                description: t.description,
                orderingMeaningful: t.orderingMeaningful,
                rows: [],
                emptyState: "no_process",
            })),
            emptyState: "no_process",
        };
    }

    const { candidates } = buildCandidates(process);
    const placements = await loadPlacementRows(
        input.supabase,
        input.orgId,
        candidates.map((c) => c.capabilityKey)
    );

    return {
        section: input.section,
        process: processMeta,
        exposures: targets.map((t) => {
            const built = buildSurfaceCommandExposureRows({
                exposure: t,
                candidates,
                placements,
            });
            return {
                kind: t.kind,
                label: t.label,
                description: t.description,
                orderingMeaningful: t.orderingMeaningful,
                rows: built.rows,
                emptyState: built.emptyState,
            };
        }),
        emptyState: "ok",
    };
}

async function ensureOrgDefinitionForCapability(
    supabase: SupabaseClient,
    orgId: string,
    capabilityKey: string,
    label: string
): Promise<string> {
    const { data: existing } = await supabase
        .from("action_definitions")
        .select("id, org_id, is_active")
        .eq("key", capabilityKey)
        .or(`org_id.is.null,org_id.eq.${orgId}`);

    const rows = (existing ?? []) as Array<{ id: string; org_id: string | null; is_active: boolean }>;
    const orgDef = rows.find((r) => r.org_id === orgId);
    if (orgDef) {
        if (!orgDef.is_active) {
            await supabase
                .from("action_definitions")
                .update({ is_active: true, updated_at: new Date().toISOString() })
                .eq("id", orgDef.id)
                .eq("org_id", orgId);
        }
        return orgDef.id;
    }

    const platform = rows.find((r) => r.org_id == null);
    const { data: inserted, error } = await supabase
        .from("action_definitions")
        .insert({
            org_id: orgId,
            key: capabilityKey,
            label,
            entity_type: "opportunity",
            action_type: "custom",
            is_active: true,
            ...(platform
                ? {}
                : {
                      description: null,
                      icon: null,
                      style: "secondary",
                      priority: 100,
                  }),
        })
        .select("id")
        .single();
    if (error) throw new Error(error.message);
    return String((inserted as { id: string }).id);
}

export async function saveSurfaceCommandExposureToggle(input: {
    supabase: SupabaseClient;
    orgId: string;
    section: SurfaceConfigSectionKey;
    departmentId?: string | null;
    processId?: string | null;
    capabilityKey: string;
    exposureKind: SurfaceCommandExposureKind;
    enabled: boolean;
    orderIndex?: number;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
    const target = surfaceCommandExposureTarget(input.exposureKind);
    if (!target) return { ok: false, error: "Unknown exposure.", status: 400 };
    if (!target.sections.includes(input.section)) {
        return { ok: false, error: "Exposure does not belong to this Surface category.", status: 400 };
    }

    const loaded = await loadSurfaceCommandExposure({
        supabase: input.supabase,
        orgId: input.orgId,
        section: input.section,
        departmentId: input.departmentId,
        processId: input.processId,
    });
    if (!loaded.process) {
        return {
            ok: false,
            error: "Associate a Business Process before configuring Command exposure.",
            status: 400,
        };
    }

    // Re-resolve selection for gate
    const { data: dept } = await input.supabase
        .from("departments")
        .select("metadata")
        .eq("id", loaded.process.departmentId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    const builder = lifecycleBuilderFromDepartmentMetadata(
        (dept as { metadata?: unknown } | null)?.metadata
    );
    const process =
        builder?.processes.find((p) => p.id === loaded.process!.processId) ?? null;
    const { selectedKeys, candidates } = buildCandidates(process);
    const candidate = candidates.find((c) => c.capabilityKey === input.capabilityKey);
    const gate = assertSurfaceMayExposeCommand({
        capabilityKey: input.capabilityKey,
        processSelectedKeys: selectedKeys,
        supported: Boolean(candidate?.supported),
    });
    if (!gate.ok) return { ok: false, error: gate.reason, status: 422 };

    const label = candidate?.label ?? humanLabelForCapability(input.capabilityKey);
    const defId = await ensureOrgDefinitionForCapability(
        input.supabase,
        input.orgId,
        input.capabilityKey,
        label
    );

    const { data: existing, error: exErr } = await input.supabase
        .from("action_placements")
        .select("id, is_active, order_index")
        .eq("org_id", input.orgId)
        .eq("action_definition_id", defId)
        .eq("surface", target.surface)
        .eq("slot", target.slot);
    if (exErr) return { ok: false, error: exErr.message, status: 500 };

    const rows = (existing ?? []) as Array<{
        id: string;
        is_active: boolean;
        order_index: number | null;
    }>;
    const orderIndex =
        typeof input.orderIndex === "number" && Number.isFinite(input.orderIndex)
            ? Math.max(0, Math.floor(input.orderIndex))
            : rows[0]?.order_index ?? 0;
    const now = new Date().toISOString();

    if (!input.enabled) {
        for (const row of rows) {
            if (!row.is_active) continue;
            const { error } = await input.supabase
                .from("action_placements")
                .update({ is_active: false, updated_at: now })
                .eq("id", row.id)
                .eq("org_id", input.orgId);
            if (error) return { ok: false, error: error.message, status: 500 };
        }
        return { ok: true };
    }

    if (rows.length === 0) {
        const { error } = await input.supabase.from("action_placements").insert({
            org_id: input.orgId,
            action_definition_id: defId,
            surface: target.surface,
            slot: target.slot,
            entity_type: "opportunity",
            section_key: null,
            order_index: orderIndex,
            display_style: "menu_item",
            is_active: true,
            condition_config: buildSurfaceCommandExposureConditionConfig(orderIndex),
        });
        if (error) return { ok: false, error: error.message, status: 500 };
        return { ok: true };
    }

    // Activate first; deactivate duplicate org rows.
    const [primary, ...dupes] = rows;
    const { error: upErr } = await input.supabase
        .from("action_placements")
        .update({
            is_active: true,
            order_index: orderIndex,
            condition_config: buildSurfaceCommandExposureConditionConfig(orderIndex),
            updated_at: now,
        })
        .eq("id", primary!.id)
        .eq("org_id", input.orgId);
    if (upErr) return { ok: false, error: upErr.message, status: 500 };
    for (const dup of dupes) {
        await input.supabase
            .from("action_placements")
            .update({ is_active: false, updated_at: now })
            .eq("id", dup.id)
            .eq("org_id", input.orgId);
    }
    return { ok: true };
}
