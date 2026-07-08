"use client";

import { useCallback, useEffect, useState } from "react";
import ConfigurationCategoryHeader from "@/components/adminV2/configuration/ConfigurationCategoryHeader";
import DataModelCustomRelationshipRow from "@/components/admin/fields/DataModelCustomRelationshipRow";
import DataModelRelationshipCreateRow from "@/components/admin/fields/DataModelRelationshipCreateRow";
import DataModelRelationshipRow from "@/components/admin/fields/DataModelRelationshipRow";
import {
    platformRelationshipsForHubEntity,
    type CustomRelationshipVocabulary,
} from "@/lib/fields/entityRelationshipCatalog";
import { PERSON_ROLE_EXAMPLES, PERSON_ROLES_TEACHING } from "@/lib/fields/dataModelWorkspaceOperatorUi";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

type Props = {
    hubEntity: SettingsHubEntityKey;
    creating?: boolean;
    onCreatingChange?: (open: boolean) => void;
};

function parseItems<T>(json: unknown): T[] {
    if (!json || typeof json !== "object") return [];
    const root = json as Record<string, unknown>;
    const data = root.data;
    if (data && typeof data === "object") {
        const items = (data as { items?: unknown }).items;
        if (Array.isArray(items)) return items as T[];
    }
    const items = root.items;
    if (Array.isArray(items)) return items as T[];
    return [];
}

export default function DataModelRelationshipsTab({
    hubEntity,
    creating = false,
    onCreatingChange,
}: Props) {
    const platformRelationships = platformRelationshipsForHubEntity(hubEntity);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedCustomId, setExpandedCustomId] = useState<string | null>(null);
    const [localCreating, setLocalCreating] = useState(false);
    const [customItems, setCustomItems] = useState<CustomRelationshipVocabulary[]>([]);
    const [customLoading, setCustomLoading] = useState(true);

    const isCreating = onCreatingChange ? creating : localCreating;
    const setCreating = (open: boolean) => {
        if (onCreatingChange) onCreatingChange(open);
        else setLocalCreating(open);
    };

    const fetchCustom = useCallback(async () => {
        setCustomLoading(true);
        try {
            const [rolesRes, personRes] = await Promise.all([
                fetch("/api/admin/customer-person-role-types?all=true"),
                fetch("/api/admin/person-relationship-type-settings?all=true"),
            ]);
            const rolesJson = await rolesRes.json().catch(() => ({}));
            const personJson = await personRes.json().catch(() => ({}));
            type Row = {
                id: string;
                key: string;
                label: string | null;
                description: string | null;
                is_system?: boolean;
                is_active?: boolean;
            };
            const custom: CustomRelationshipVocabulary[] = [];
            for (const row of parseItems<Row>(rolesJson)) {
                if (row.is_system) continue;
                custom.push({
                    id: row.id,
                    key: row.key,
                    label: row.label ?? row.key,
                    description: row.description,
                    kind: "family_role",
                    is_active: row.is_active !== false,
                });
            }
            for (const row of parseItems<Row>(personJson)) {
                if (row.is_system) continue;
                custom.push({
                    id: row.id,
                    key: row.key,
                    label: row.label ?? row.key,
                    description: row.description,
                    kind: "person_relationship",
                    is_active: row.is_active !== false,
                });
            }
            custom.sort((a, b) => a.label.localeCompare(b.label));
            setCustomItems(custom);
        } catch {
            setCustomItems([]);
        } finally {
            setCustomLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchCustom();
    }, [fetchCustom]);

    return (
        <div className="space-y-4" data-testid="data-model-relationships-tab">
            <div
                className="rounded-lg border border-alloy-bend-pine/15 bg-alloy-bend-pine/[0.03] px-3 py-2.5"
                data-testid="person-roles-teaching"
            >
                <p className="text-[11px] leading-snug text-alloy-midnight/60">{PERSON_ROLES_TEACHING}</p>
                <p className="mt-1.5 text-[10px] text-alloy-midnight/45">
                    Examples: {PERSON_ROLE_EXAMPLES.join(" · ")}
                </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-2xl text-[11px] leading-snug text-alloy-midnight/55">
                    Platform relationships describe how entities connect. Custom relationships extend your vocabulary.
                </p>
                <button
                    type="button"
                    onClick={() => {
                        setCreating(true);
                        setExpandedId(null);
                        setExpandedCustomId(null);
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
                onCreated={() => void fetchCustom()}
            />

            <section className="space-y-1.5" data-testid="platform-relationships-section">
                <ConfigurationCategoryHeader label="Platform relationships" testId="platform-relationships-header" />
                <div
                    className="overflow-hidden rounded-lg border border-alloy-forge/12 bg-white"
                    data-testid="data-model-relationship-list"
                >
                    {platformRelationships.map((rel) => (
                        <DataModelRelationshipRow
                            key={rel.id}
                            relationship={rel}
                            expanded={expandedId === rel.id}
                            onExpand={() => {
                                setCreating(false);
                                setExpandedCustomId(null);
                                setExpandedId(rel.id);
                            }}
                            onCollapse={() => setExpandedId(null)}
                        />
                    ))}
                </div>
            </section>

            <section className="space-y-1.5" data-testid="custom-relationships-section">
                <ConfigurationCategoryHeader label="Custom relationships" testId="custom-relationships-header" />
                {customLoading ? (
                    <p className="text-[12px] text-alloy-midnight/45">Loading custom relationships…</p>
                ) : customItems.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-alloy-forge/15 px-3 py-4 text-[12px] text-alloy-midnight/45">
                        No custom relationships yet. Add one to extend your organization&apos;s vocabulary.
                    </p>
                ) : (
                    <div className="overflow-hidden rounded-lg border border-alloy-forge/12 bg-white">
                        {customItems.map((item) => (
                            <DataModelCustomRelationshipRow
                                key={item.id}
                                item={item}
                                expanded={expandedCustomId === item.id}
                                onExpand={() => {
                                    setCreating(false);
                                    setExpandedId(null);
                                    setExpandedCustomId(item.id);
                                }}
                                onCollapse={() => setExpandedCustomId(null)}
                                onSaved={() => void fetchCustom()}
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
