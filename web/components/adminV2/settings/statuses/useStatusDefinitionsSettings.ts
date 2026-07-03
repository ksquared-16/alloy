"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StatusDef } from "@/app/api/admin/status-definitions/route";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { buildStatusCategoryCatalog } from "@/lib/lifecycle/statusCategoryCatalog";
import {
    BP_PICKER_VISIBLE_CATEGORY_KEYS,
    STATUS_SETTINGS_CATEGORY_DESCRIPTIONS,
} from "@/lib/lifecycle/statusSettingsCategoryDoctrine";
import type { StatusRollupCategoryKey } from "@/lib/lifecycle/statusRollupV1";
import { STATUS_CATEGORY_LABELS } from "@/lib/lifecycle/statusRollupV1";

const STATUS_SETTINGS_ENTITY_TYPES = new Set([
    "opportunities",
    "opportunity_customer_members",
    "persons",
]);

function statusDefToRow(row: StatusDef): StatusDefinitionRow {
    return {
        id: row.id,
        org_id: row.org_id ?? "",
        entity_type: row.entity_type,
        status_key: row.status_key,
        status_label: row.status_label,
        sort_order: row.sort_order,
        is_active: row.is_active,
        is_system: row.is_system,
        industry_key: null,
        metadata: row.metadata,
    };
}

export type StatusCategoryGroup = {
    category_key: StatusRollupCategoryKey;
    label: string;
    description: string;
    statusDefs: StatusDef[];
};

export const STATUS_QUEUE_DISPLAY_LABELS: Partial<Record<StatusRollupCategoryKey, string>> = {
    enrollment_statuses: "Enrollment Participation",
    lead_statuses: "Lead Statuses",
    person_statuses: "People Statuses",
};

export function useStatusDefinitionsSettings() {
    const [statuses, setStatuses] = useState<StatusDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showInactive, setShowInactive] = useState(false);
    const [selectedCategoryKey, setSelectedCategoryKey] = useState<StatusRollupCategoryKey | null>(null);
    const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    const fetchStatuses = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (showInactive) params.set("include_inactive", "1");
            const qs = params.toString();
            const url = qs ? `/api/admin/status-definitions?${qs}` : "/api/admin/status-definitions";
            const res = await fetch(url);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load statuses");
            setStatuses((json as { statuses?: StatusDef[] }).statuses ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load statuses");
            setStatuses([]);
        } finally {
            setLoading(false);
        }
    }, [showInactive]);

    useEffect(() => {
        void fetchStatuses();
    }, [fetchStatuses]);

    const categoryGroups = useMemo((): StatusCategoryGroup[] => {
        const rows = statuses
            .filter((s) => STATUS_SETTINGS_ENTITY_TYPES.has(s.entity_type))
            .map(statusDefToRow);
        const catalog = buildStatusCategoryCatalog(rows, {
            includeSystemCategories: false,
            categoryKeys: BP_PICKER_VISIBLE_CATEGORY_KEYS,
        });
        const byKey = new Map(statuses.map((s) => [`${s.entity_type}:${s.status_key}`, s] as const));
        return catalog.map((group) => ({
            category_key: group.category_key,
            label: STATUS_QUEUE_DISPLAY_LABELS[group.category_key] ?? STATUS_CATEGORY_LABELS[group.category_key] ?? group.label,
            description:
                STATUS_SETTINGS_CATEGORY_DESCRIPTIONS[
                    group.category_key as keyof typeof STATUS_SETTINGS_CATEGORY_DESCRIPTIONS
                ] ?? "",
            statusDefs: group.statuses
                .map((s) => byKey.get(`${s.entity_type}:${s.status_key}`))
                .filter((s): s is StatusDef => s != null)
                .sort((a, b) => a.sort_order - b.sort_order || (a.status_label ?? "").localeCompare(b.status_label ?? "")),
        }));
    }, [statuses]);

    useEffect(() => {
        if (!categoryGroups.length) {
            setSelectedCategoryKey(null);
            return;
        }
        if (!selectedCategoryKey || !categoryGroups.some((g) => g.category_key === selectedCategoryKey)) {
            setSelectedCategoryKey(categoryGroups[0]!.category_key);
        }
    }, [categoryGroups, selectedCategoryKey]);

    const selectedCategory = useMemo(
        () => categoryGroups.find((g) => g.category_key === selectedCategoryKey) ?? null,
        [categoryGroups, selectedCategoryKey],
    );

    useEffect(() => {
        if (!selectedCategory?.statusDefs.length) {
            setSelectedStatusId(null);
            return;
        }
        if (!selectedStatusId || !selectedCategory.statusDefs.some((s) => s.id === selectedStatusId)) {
            setSelectedStatusId(selectedCategory.statusDefs[0]!.id);
        }
    }, [selectedCategory, selectedStatusId]);

    const selectedStatus = useMemo(
        () => selectedCategory?.statusDefs.find((s) => s.id === selectedStatusId) ?? null,
        [selectedCategory, selectedStatusId],
    );

    const patchStatus = useCallback(
        async (id: string, patch: Partial<Pick<StatusDef, "status_label" | "sort_order" | "is_active">>) => {
            const res = await fetch(`/api/admin/status-definitions/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            await fetchStatuses();
            setActionMessage("Status saved.");
        },
        [fetchStatuses],
    );

    return {
        loading,
        error,
        actionMessage,
        showInactive,
        setShowInactive,
        categoryGroups,
        selectedCategoryKey,
        setSelectedCategoryKey,
        selectedCategory,
        selectedStatusId,
        setSelectedStatusId,
        selectedStatus,
        patchStatus,
        refresh: fetchStatuses,
        setActionMessage,
    };
}
