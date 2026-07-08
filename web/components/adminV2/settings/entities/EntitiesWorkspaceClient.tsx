"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfigLockBanner from "@/components/admin/ConfigLockBanner";
import {
    CONFIG_WORKSPACE_GHOST_ACTION_CLASS,
    CONFIG_WORKSPACE_INLINE_EDITOR_SHELL_CLASS,
    CONFIG_WORKSPACE_ROW_CLASS,
    CONFIG_WORKSPACE_ROW_EXPANDED_CLASS,
    CONFIG_WORKSPACE_ROW_INNER_CLASS,
} from "@/lib/adminV2/configuration/configurationWorkspaceOperatorUi";
import {
    configurationPrimaryHubEntities,
    resolveConfigurationEntityPluralLabel,
    resolveConfigurationEntitySingularLabel,
    type ConfigurationHubEntityDefinition,
} from "@/lib/adminV2/configuration/configurationEntityCatalog";
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { DATA_MODEL_ICON_STROKE } from "@/lib/fields/dataModelWorkspaceIcons";
import { ExternalLink } from "lucide-react";

type LabelRow = { entity_type: string; singular: string | null; plural: string | null };

type ApiResponse = {
    org_industry_id: string | null;
    industry: { key: string; label: string } | null;
    defaults: LabelRow[];
    overrides: LabelRow[];
    effective: LabelRow[];
};

type IndustryOption = { id: string; key: string; label: string };

const GENERIC_VALUE = "__generic__";

function EntityWorkspaceRow({
    entity,
    singularLabel,
    pluralLabel,
    defaultSingular,
    defaultPlural,
    expanded,
    canMutate,
    locked,
    saving,
    error,
    onExpand,
    onCollapse,
    onSave,
    onReset,
}: {
    entity: ConfigurationHubEntityDefinition;
    singularLabel: string;
    pluralLabel: string;
    defaultSingular: string;
    defaultPlural: string;
    expanded: boolean;
    canMutate: boolean;
    locked: boolean;
    saving: boolean;
    error: string | null;
    onExpand: () => void;
    onCollapse: () => void;
    onSave: (values: { singular: string; plural: string }) => void | Promise<void>;
    onReset: () => void | Promise<void>;
}) {
    const Icon = entity.icon;
    const [singular, setSingular] = useState(singularLabel);
    const [plural, setPlural] = useState(pluralLabel);

    useEffect(() => {
        if (expanded) {
            setSingular(singularLabel);
            setPlural(pluralLabel);
        }
    }, [expanded, singularLabel, pluralLabel]);

    return (
        <div
            className={[CONFIG_WORKSPACE_ROW_CLASS, expanded ? CONFIG_WORKSPACE_ROW_EXPANDED_CLASS : ""].join(" ")}
            data-testid="entities-workspace-row"
            data-hub-entity={entity.hubKey}
            data-expanded={expanded ? "true" : "false"}
        >
            <div className={CONFIG_WORKSPACE_ROW_INNER_CLASS}>
                <Icon size={15} strokeWidth={DATA_MODEL_ICON_STROKE} className="shrink-0 text-alloy-bend-pine" aria-hidden />
                <button type="button" onClick={onExpand} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px] font-medium text-alloy-midnight">{singularLabel}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-alloy-midnight/45">{entity.description}</span>
                </button>
                <a
                    href={`${adminSettingsSubpathHref("fields")}?entity=${encodeURIComponent(entity.hubKey)}`}
                    className="hidden shrink-0 text-[10px] font-medium text-alloy-bend-pine hover:underline sm:inline"
                    data-testid={`entities-open-data-model-${entity.hubKey}`}
                >
                    Data Model
                </a>
                <button
                    type="button"
                    onClick={expanded ? onCollapse : onExpand}
                    className={[CONFIG_WORKSPACE_GHOST_ACTION_CLASS, expanded ? "opacity-100" : ""].join(" ")}
                    data-testid="entities-row-edit"
                >
                    {expanded ? "Close" : canMutate && !locked ? "Edit" : "View"}
                </button>
            </div>
            {expanded ? (
                <div className="space-y-2 border-t border-alloy-forge/8 px-3 pb-2.5 pt-2" data-testid="entities-row-editor">
                    <p className="text-[11px] text-alloy-midnight/50">{entity.surfacesLine}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block space-y-0.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                Singular name
                            </span>
                            <input
                                value={singular}
                                onChange={(e) => setSingular(e.target.value)}
                                disabled={!canMutate || locked}
                                className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm disabled:opacity-60"
                                data-testid="entities-singular-input"
                            />
                        </label>
                        <label className="block space-y-0.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                Plural name
                            </span>
                            <input
                                value={plural}
                                onChange={(e) => setPlural(e.target.value)}
                                disabled={!canMutate || locked}
                                className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm disabled:opacity-60"
                                data-testid="entities-plural-input"
                            />
                        </label>
                    </div>
                    <p className="text-[10px] text-alloy-midnight/40">
                        Industry default: {defaultSingular} / {defaultPlural}
                    </p>
                    {error ? (
                        <p className="text-xs text-alloy-ember" data-testid="entities-row-error">
                            {error}
                        </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        {canMutate && !locked ? (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => void onReset()}
                                className="text-[11px] font-medium text-alloy-midnight/55 hover:underline disabled:opacity-50"
                                data-testid="entities-reset-labels"
                            >
                                Reset to industry default
                            </button>
                        ) : (
                            <span />
                        )}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={saving}
                                onClick={onCollapse}
                                className="config-secondary-btn rounded-lg border border-alloy-forge/12 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70"
                            >
                                Close
                            </button>
                            {canMutate && !locked ? (
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void onSave({ singular: singular.trim(), plural: plural.trim() })}
                                    className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                                    data-testid="entities-save-labels"
                                >
                                    {saving ? "Saving…" : "Save"}
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function EntitiesWorkspaceClient() {
    const { canMutate } = useAdminAuth();
    const { labels, refreshEntityLabels } = useEntityLabels();
    const [data, setData] = useState<ApiResponse | null>(null);
    const [industries, setIndustries] = useState<IndustryOption[]>([]);
    const [configLocked, setConfigLocked] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedHub, setExpandedHub] = useState<string | null>(null);
    const [savingHub, setSavingHub] = useState<string | null>(null);
    const [rowError, setRowError] = useState<string | null>(null);
    const [industrySaving, setIndustrySaving] = useState(false);

    const hubEntities = configurationPrimaryHubEntities();

    const fetchData = useCallback(async () => {
        const res = await fetch("/api/admin/entity-labels");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load entities");
        setData(json as ApiResponse);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                await fetchData();
                const [indRes, lockRes] = await Promise.all([
                    fetch("/api/admin/industries"),
                    fetch("/api/admin/org-settings"),
                ]);
                const indJson = await indRes.json().catch(() => ({}));
                const lockJson = await lockRes.json().catch(() => ({}));
                if (!cancelled) {
                    setIndustries((indJson as { industries?: IndustryOption[] }).industries ?? []);
                    setConfigLocked(Boolean((lockJson as { config_locked?: boolean }).config_locked));
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [fetchData]);

    const defaultsByType = useMemo(
        () => new Map((data?.defaults ?? []).map((d) => [d.entity_type, d] as const)),
        [data],
    );

    const saveLabels = async (entity: ConfigurationHubEntityDefinition, values: { singular: string; plural: string }) => {
        if (!canMutate || configLocked) return;
        setSavingHub(entity.hubKey);
        setRowError(null);
        try {
            const res = await fetch("/api/admin/entity-labels", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: entity.labelsKey,
                    singular: values.singular,
                    plural: values.plural,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            await fetchData();
            await refreshEntityLabels();
            setExpandedHub(null);
        } catch (e) {
            setRowError((e as Error).message);
        } finally {
            setSavingHub(null);
        }
    };

    const resetLabels = async (entity: ConfigurationHubEntityDefinition) => {
        if (!canMutate || configLocked) return;
        setSavingHub(entity.hubKey);
        setRowError(null);
        try {
            const res = await fetch(
                `/api/admin/entity-labels?entity_type=${encodeURIComponent(entity.labelsKey)}`,
                { method: "DELETE" },
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Reset failed");
            await fetchData();
            await refreshEntityLabels();
            setExpandedHub(null);
        } catch (e) {
            setRowError((e as Error).message);
        } finally {
            setSavingHub(null);
        }
    };

    const handleIndustryChange = async (value: string) => {
        if (!canMutate || configLocked) return;
        setIndustrySaving(true);
        setRowError(null);
        try {
            const res = await fetch("/api/admin/org/industry", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ industry_id: value === GENERIC_VALUE ? null : value }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to update industry");
            await fetchData();
            await refreshEntityLabels();
        } catch (e) {
            setRowError((e as Error).message);
        } finally {
            setIndustrySaving(false);
        }
    };

    if (loading) {
        return <p className="text-[12px] text-alloy-midnight/45">Loading entities…</p>;
    }

    if (error || !data) {
        return <p className="text-sm text-alloy-ember">{error ?? "Failed to load entities"}</p>;
    }

    const industryOptions = industries.filter((i) => i.key !== "generic").sort((a, b) => a.label.localeCompare(b.label));

    return (
        <div className="min-w-0 space-y-3" data-testid="entities-workspace">
            {configLocked ? <ConfigLockBanner /> : null}

            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.2] px-3 py-2.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Industry</label>
                <select
                    value={data.org_industry_id ?? GENERIC_VALUE}
                    onChange={(e) => void handleIndustryChange(e.target.value)}
                    disabled={!canMutate || industrySaving || configLocked}
                    className="rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm disabled:opacity-60"
                    data-testid="entities-industry-select"
                >
                    <option value={GENERIC_VALUE}>Generic</option>
                    {industryOptions.map((i) => (
                        <option key={i.id} value={i.id}>
                            {i.label}
                        </option>
                    ))}
                </select>
                {industrySaving ? <span className="text-[11px] text-alloy-midnight/45">Saving…</span> : null}
            </div>

            <p className="text-[12px] text-alloy-midnight/55">
                Name the record types your team sees across queues, drawers, and workflows. These names match the Data
                Model entity rail.
            </p>

            <div className={CONFIG_WORKSPACE_INLINE_EDITOR_SHELL_CLASS}>
                <div className="overflow-hidden rounded-lg border border-alloy-forge/12 bg-white">
                    {hubEntities.map((entity) => {
                        const defaults = defaultsByType.get(entity.labelsKey);
                        const singular = resolveConfigurationEntitySingularLabel(labels, entity.hubKey);
                        const plural = resolveConfigurationEntityPluralLabel(labels, entity.hubKey);
                        return (
                            <EntityWorkspaceRow
                                key={entity.hubKey}
                                entity={entity}
                                singularLabel={singular}
                                pluralLabel={plural}
                                defaultSingular={defaults?.singular ?? entity.canonicalSingularLabel}
                                defaultPlural={defaults?.plural ?? entity.canonicalPluralLabel}
                                expanded={expandedHub === entity.hubKey}
                                canMutate={canMutate}
                                locked={configLocked}
                                saving={savingHub === entity.hubKey}
                                error={expandedHub === entity.hubKey ? rowError : null}
                                onExpand={() => {
                                    setExpandedHub(entity.hubKey);
                                    setRowError(null);
                                }}
                                onCollapse={() => {
                                    setExpandedHub(null);
                                    setRowError(null);
                                }}
                                onSave={(values) => saveLabels(entity, values)}
                                onReset={() => resetLabels(entity)}
                            />
                        );
                    })}
                </div>
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-alloy-midnight/45">
                <ExternalLink size={12} strokeWidth={DATA_MODEL_ICON_STROKE} aria-hidden />
                Field and category configuration lives in{" "}
                <a href={adminSettingsSubpathHref("fields")} className="font-medium text-alloy-bend-pine hover:underline">
                    Data Model
                </a>
                .
            </p>
        </div>
    );
}
