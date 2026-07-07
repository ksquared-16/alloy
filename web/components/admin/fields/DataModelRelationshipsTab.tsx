"use client";

import { relationshipsForHubEntity } from "@/lib/fields/entityRelationshipCatalog";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

type Props = {
    hubEntity: SettingsHubEntityKey;
    onAddRelationship?: () => void;
};

export default function DataModelRelationshipsTab({ hubEntity, onAddRelationship }: Props) {
    const relationships = relationshipsForHubEntity(hubEntity);

    return (
        <div className="space-y-4" data-testid="data-model-relationships-tab">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-alloy-midnight/60">
                    Parents, guardians, emergency contacts, and billing contacts are{" "}
                    <span className="font-medium text-alloy-midnight">Person roles</span> — not separate entities.
                </p>
                {onAddRelationship ? (
                    <button
                        type="button"
                        onClick={onAddRelationship}
                        className="rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                        data-testid="relationships-add-button"
                    >
                        + Add Relationship
                    </button>
                ) : null}
            </div>
            <div className="grid gap-3">
                {relationships.map((rel) => (
                    <article
                        key={rel.id}
                        className="rounded-xl border border-alloy-forge/12 bg-white p-4 shadow-sm"
                        data-testid="data-model-relationship-card"
                    >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-alloy-midnight">{rel.label}</h3>
                                <p className="mt-1 text-xs text-alloy-midnight/55">
                                    → {rel.target_label}
                                    <span className="mx-2 text-alloy-midnight/30">·</span>
                                    {rel.cardinality}
                                    <span className="mx-2 text-alloy-midnight/30">·</span>
                                    {rel.required ? "Required" : "Optional"}
                                </p>
                                {rel.role_note ? (
                                    <p className="mt-2 text-[11px] leading-relaxed text-alloy-midnight/50">{rel.role_note}</p>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                className="rounded-md border border-alloy-forge/15 px-2 py-1 text-[10px] text-alloy-midnight/50"
                                disabled
                            >
                                Actions
                            </button>
                        </div>
                        <p className="mt-3 text-[10px] text-alloy-midnight/45">
                            Used in: {rel.where_used.join(" · ")}
                        </p>
                    </article>
                ))}
            </div>
        </div>
    );
}
