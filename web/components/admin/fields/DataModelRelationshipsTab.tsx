"use client";

import { useState } from "react";
import DataModelRelationshipCreateRow from "@/components/admin/fields/DataModelRelationshipCreateRow";
import DataModelRelationshipRow from "@/components/admin/fields/DataModelRelationshipRow";
import { relationshipsForHubEntity } from "@/lib/fields/entityRelationshipCatalog";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

type Props = {
    hubEntity: SettingsHubEntityKey;
    creating?: boolean;
    onCreatingChange?: (open: boolean) => void;
};

export default function DataModelRelationshipsTab({
    hubEntity,
    creating = false,
    onCreatingChange,
}: Props) {
    const relationships = relationshipsForHubEntity(hubEntity);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [localCreating, setLocalCreating] = useState(false);
    const isCreating = onCreatingChange ? creating : localCreating;
    const setCreating = (open: boolean) => {
        if (onCreatingChange) onCreatingChange(open);
        else setLocalCreating(open);
    };

    return (
        <div className="space-y-3" data-testid="data-model-relationships-tab">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-2xl text-[11px] leading-snug text-alloy-midnight/55">
                    Parents, guardians, emergency contacts, and billing contacts are{" "}
                    <span className="font-medium text-alloy-midnight">Person roles</span> — not separate entities.
                </p>
                <button
                    type="button"
                    onClick={() => {
                        setCreating(true);
                        setExpandedId(null);
                    }}
                    className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-alloy-bend-pine/90"
                    data-testid="relationships-add-button"
                >
                    Add Relationship
                </button>
            </div>

            <DataModelRelationshipCreateRow
                open={isCreating}
                hubEntity={hubEntity}
                onCancel={() => setCreating(false)}
            />

            <div
                className="overflow-hidden rounded-lg border border-alloy-forge/12 bg-white"
                data-testid="data-model-relationship-list"
            >
                {relationships.map((rel) => (
                    <DataModelRelationshipRow
                        key={rel.id}
                        relationship={rel}
                        expanded={expandedId === rel.id}
                        onExpand={() => {
                            setCreating(false);
                            setExpandedId(rel.id);
                        }}
                        onCollapse={() => setExpandedId(null)}
                    />
                ))}
            </div>
        </div>
    );
}
