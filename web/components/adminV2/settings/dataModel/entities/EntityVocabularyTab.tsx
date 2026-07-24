"use client";

import { useEffect, useState } from "react";
import ConfigLockBanner from "@/components/admin/ConfigLockBanner";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import type { EntityWorkspaceVm } from "@/lib/dataModel/dataModelWorkspaceVm";
import type { DataModelIndustryOption } from "@/lib/dataModel/loadDataModelEntitiesWorkspaceVm";

type EntityLabelsApiPayload = {
    org_industry_id: string | null;
    defaults: { entity_type: string; singular: string | null; plural: string | null }[];
    overrides: { entity_type: string; singular: string | null; plural: string | null }[];
    effective: { entity_type: string; singular: string | null; plural: string | null }[];
};

const GENERIC_VALUE = "__generic__";

/**
 * Entities → Vocabulary. Extracted from the legacy `EntitiesWorkspaceClient`
 * expand-in-row editor — same mutation paths (`/api/admin/entity-labels`,
 * `/api/admin/org/industry`), now the primary editing surface for this tab
 * rather than an inline row toggle.
 */
export function EntityVocabularyTab({
    entity,
    canMutate,
    configLocked,
    industries,
    orgIndustryId,
    onVocabularyPayload,
    testId = "entity-vocabulary-tab",
}: {
    entity: EntityWorkspaceVm;
    canMutate: boolean;
    configLocked: boolean;
    industries: readonly DataModelIndustryOption[];
    orgIndustryId: string | null;
    /** Fired with the full entity-labels payload after any successful mutation. */
    onVocabularyPayload: (payload: EntityLabelsApiPayload) => void;
    testId?: string;
}) {
    const { refreshEntityLabels } = useEntityLabels();
    const [singular, setSingular] = useState(entity.vocabulary.singular);
    const [plural, setPlural] = useState(entity.vocabulary.plural);
    const [saving, setSaving] = useState(false);
    const [industrySaving, setIndustrySaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setSingular(entity.vocabulary.singular);
        setPlural(entity.vocabulary.plural);
        setError(null);
    }, [entity.hubKey, entity.vocabulary.singular, entity.vocabulary.plural]);

    const fetchLabelsPayload = async (): Promise<EntityLabelsApiPayload> => {
        const res = await fetch("/api/admin/entity-labels");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load vocabulary");
        return json as EntityLabelsApiPayload;
    };

    const afterMutation = async () => {
        const payload = await fetchLabelsPayload();
        onVocabularyPayload(payload);
        await refreshEntityLabels();
    };

    const canEdit = canMutate && !configLocked;
    const locked = configLocked;

    const save = async () => {
        if (!canEdit) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/entity-labels", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: entity.labelsKey,
                    singular: singular.trim(),
                    plural: plural.trim(),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            await afterMutation();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const reset = async () => {
        if (!canEdit) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/entity-labels?entity_type=${encodeURIComponent(entity.labelsKey)}`, {
                method: "DELETE",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Reset failed");
            await afterMutation();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const changeIndustry = async (value: string) => {
        if (!canEdit) return;
        setIndustrySaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/org/industry", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ industry_id: value === GENERIC_VALUE ? null : value }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to update industry");
            await afterMutation();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIndustrySaving(false);
        }
    };

    const dirty = singular.trim() !== entity.vocabulary.singular || plural.trim() !== entity.vocabulary.plural;

    return (
        <div className="space-y-3" data-testid={testId}>
            {locked ? <ConfigLockBanner /> : null}

            {industries.length > 1 ?
                <ConfigWorkspaceCard title="Organization industry" compact testId="entity-vocabulary-industry">
                    <p className="mb-2 text-[11px] leading-4 text-alloy-midnight/55">
                        Sets the industry-default vocabulary used across all Entities before organization overrides.
                    </p>
                    <select
                        value={orgIndustryId ?? GENERIC_VALUE}
                        onChange={(event) => void changeIndustry(event.target.value)}
                        disabled={!canEdit || industrySaving}
                        className="rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm disabled:opacity-60"
                        data-testid="entity-vocabulary-industry-select"
                    >
                        <option value={GENERIC_VALUE}>Generic</option>
                        {industries.map((industry) => (
                            <option key={industry.id} value={industry.id}>
                                {industry.label}
                            </option>
                        ))}
                    </select>
                    {industrySaving ? <span className="ml-2 text-[11px] text-alloy-midnight/45">Saving…</span> : null}
                </ConfigWorkspaceCard>
            :   null}

            <ConfigWorkspaceCard
                title={`${entity.displayName} vocabulary`}
                description="Names your team sees for this record type across queues, drawers, and workflows."
                compact
                testId="entity-vocabulary-editor"
            >
                <div className="grid gap-2.5 sm:grid-cols-2">
                    <label className="block space-y-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                            Singular name
                        </span>
                        <input
                            value={singular}
                            onChange={(event) => setSingular(event.target.value)}
                            disabled={!canEdit}
                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm disabled:opacity-60"
                            data-testid="entity-vocabulary-singular-input"
                        />
                    </label>
                    <label className="block space-y-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                            Plural name
                        </span>
                        <input
                            value={plural}
                            onChange={(event) => setPlural(event.target.value)}
                            disabled={!canEdit}
                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm disabled:opacity-60"
                            data-testid="entity-vocabulary-plural-input"
                        />
                    </label>
                </div>
                <p className="mt-2 text-[10px] text-alloy-midnight/40">
                    Industry default: {entity.vocabulary.defaultSingular} / {entity.vocabulary.defaultPlural}
                </p>
                {error ?
                    <p className="mt-2 text-xs text-alloy-ember" data-testid="entity-vocabulary-error">
                        {error}
                    </p>
                :   null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {canEdit && entity.vocabulary.isOverridden ?
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => void reset()}
                            className="text-[11px] font-medium text-alloy-midnight/55 hover:underline disabled:opacity-50"
                            data-testid="entity-vocabulary-reset"
                        >
                            Reset to industry default
                        </button>
                    :   <span />}
                    {canEdit ?
                        <button
                            type="button"
                            disabled={saving || !dirty}
                            onClick={() => void save()}
                            className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                            data-testid="entity-vocabulary-save"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    :   null}
                </div>
            </ConfigWorkspaceCard>
        </div>
    );
}
