"use client";

import clsx from "clsx";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    addEvidenceCollectionToGroup,
    catalogEvidenceCollectionsForGroup,
    moveEvidenceCollectionInGroup,
    removeEvidenceCollectionFromGroup,
    setEvidenceCollectionEnabled,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

type Props = {
    surfaceId: string;
    groupKey: string;
    config: NestedSurfaceConfig;
    onChange: (next: NestedSurfaceConfig) => void;
    className?: string;
};

/** Minimum evidence collection authoring — add, remove, reorder, enable. */
export default function IdentityEvidenceCollectionsPanel({
    surfaceId,
    groupKey,
    config,
    onChange,
    className,
}: Props) {
    const group = config.groups.find((entry) => entry.key === groupKey);
    const collections = group?.evidenceCollections ?? [];
    const catalog = catalogEvidenceCollectionsForGroup(surfaceId, groupKey).filter(
        (entry) => !collections.some((collection) => collection.key === entry.key),
    );

    return (
        <div className={clsx("identity-evidence-collections-panel space-y-4", className)} data-identity-evidence-panel="true">
            <p className="config-typo-sublabel">
                Evidence collections appear only at the Evidence runtime depth. They stay collection-oriented — not field grids.
            </p>

            {collections.length === 0 ?
                <p className="config-typo-sublabel">No evidence collections configured yet.</p>
            :   (
                <ul className="space-y-2">
                    {collections.map((collection, index) => (
                        <li
                            key={collection.key}
                            className="flex items-center justify-between gap-2 rounded-lg border border-alloy-stone/15 bg-white p-3"
                        >
                            <div className="min-w-0">
                                <p className="text-[12px] font-medium text-alloy-midnight">{collection.label}</p>
                                <p className="config-typo-sublabel">Preview: representative items for {collection.label.toLowerCase()}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <label className="flex items-center gap-1 text-[11px] text-alloy-midnight/55">
                                    <input
                                        type="checkbox"
                                        checked={collection.enabled !== false}
                                        onChange={(event) =>
                                            onChange(
                                                setEvidenceCollectionEnabled(
                                                    config,
                                                    groupKey,
                                                    collection.key,
                                                    event.target.checked,
                                                ),
                                            )
                                        }
                                    />
                                    Enabled
                                </label>
                                <button
                                    type="button"
                                    className="text-[11px] text-alloy-midnight/45 hover:text-alloy-midnight disabled:opacity-30"
                                    disabled={index === 0}
                                    onClick={() =>
                                        onChange(moveEvidenceCollectionInGroup(config, groupKey, collection.key, -1))
                                    }
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    className="text-[11px] text-alloy-midnight/45 hover:text-alloy-midnight disabled:opacity-30"
                                    disabled={index === collections.length - 1}
                                    onClick={() =>
                                        onChange(moveEvidenceCollectionInGroup(config, groupKey, collection.key, 1))
                                    }
                                >
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    className="text-[11px] font-medium text-alloy-pine hover:underline"
                                    onClick={() =>
                                        onChange(removeEvidenceCollectionFromGroup(config, groupKey, collection.key))
                                    }
                                >
                                    Remove
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {catalog.length > 0 ?
                <label className="flex items-center gap-2 text-[12px] text-alloy-midnight">
                    <span>Add collection</span>
                    <select
                        className="rounded border border-alloy-stone/20 px-2 py-1 text-[12px]"
                        defaultValue=""
                        onChange={(event) => {
                            const key = event.target.value;
                            if (!key) return;
                            onChange(addEvidenceCollectionToGroup(config, groupKey, key));
                            event.currentTarget.value = "";
                        }}
                    >
                        <option value="">Choose…</option>
                        {catalog.map((entry) => (
                            <option key={entry.key} value={entry.key}>
                                {entry.label}
                            </option>
                        ))}
                    </select>
                </label>
            :   null}
        </div>
    );
}
