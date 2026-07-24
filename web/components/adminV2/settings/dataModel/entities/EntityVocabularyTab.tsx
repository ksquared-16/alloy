"use client";

import { useEffect, useState } from "react";
import ConfigLockBanner from "@/components/admin/ConfigLockBanner";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import type { EntityWorkspaceVm } from "@/lib/dataModel/dataModelWorkspaceVm";

type EntityLabelsApiPayload = {
    defaults: { entity_type: string; singular: string | null; plural: string | null }[];
    overrides: { entity_type: string; singular: string | null; plural: string | null }[];
    effective: { entity_type: string; singular: string | null; plural: string | null }[];
};

/**
 * Entity → Vocabulary. The names this organization uses for one record type.
 *
 * This tab owns exactly one decision: what this Entity is called. It does not
 * expose the organization's industry — industry is an organization-profile
 * setting that happens to seed defaults, not a per-Entity vocabulary control, and
 * putting it here made a global switch look like a field on the Person entity.
 * Mutation path (`/api/admin/entity-labels`) is unchanged.
 */
export function EntityVocabularyTab({
    entity,
    canMutate,
    configLocked,
    onVocabularyPayload,
    testId = "entity-vocabulary-tab",
}: {
    entity: EntityWorkspaceVm;
    canMutate: boolean;
    configLocked: boolean;
    /** Fired with the full entity-labels payload after any successful mutation. */
    onVocabularyPayload: (payload: EntityLabelsApiPayload) => void;
    testId?: string;
}) {
    const { refreshEntityLabels } = useEntityLabels();
    const [singular, setSingular] = useState(entity.vocabulary.singular);
    const [plural, setPlural] = useState(entity.vocabulary.plural);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setSingular(entity.vocabulary.singular);
        setPlural(entity.vocabulary.plural);
        setError(null);
    }, [entity.hubKey, entity.vocabulary.singular, entity.vocabulary.plural]);

    const afterMutation = async () => {
        const res = await fetch("/api/admin/entity-labels");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load vocabulary");
        onVocabularyPayload(json as EntityLabelsApiPayload);
        await refreshEntityLabels();
    };

    const canEdit = canMutate && !configLocked;

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

    const dirty = singular.trim() !== entity.vocabulary.singular || plural.trim() !== entity.vocabulary.plural;

    return (
        <div className="space-y-3" data-testid={testId}>
            {configLocked ? <ConfigLockBanner /> : null}

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
                <p className="mt-2 text-[10px] text-alloy-midnight/40" data-testid="entity-vocabulary-default-hint">
                    Alloy default: {entity.vocabulary.defaultSingular} / {entity.vocabulary.defaultPlural}
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
                            Reset to Alloy default
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
