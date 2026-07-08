"use client";

import { relationshipsForHubEntity } from "@/lib/fields/entityRelationshipCatalog";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import { DATA_MODEL_ICON_STROKE } from "@/lib/fields/dataModelWorkspaceIcons";
import { ArrowRight, Link2 } from "lucide-react";

type Props = {
    hubEntity: SettingsHubEntityKey;
    onAddRelationship?: () => void;
};

export default function DataModelRelationshipsTab({ hubEntity, onAddRelationship }: Props) {
    const relationships = relationshipsForHubEntity(hubEntity);

    return (
        <div className="space-y-3" data-testid="data-model-relationships-tab">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-2xl text-[11px] leading-snug text-alloy-midnight/55">
                    Parents, guardians, emergency contacts, and billing contacts are{" "}
                    <span className="font-medium text-alloy-midnight">Person roles</span> — not separate entities.
                </p>
                {onAddRelationship ? (
                    <button
                        type="button"
                        onClick={onAddRelationship}
                        className="config-primary-btn rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-alloy-bend-pine/90"
                        data-testid="relationships-add-button"
                    >
                        + Add Relationship
                    </button>
                ) : null}
            </div>
            <div className="grid gap-2.5">
                {relationships.map((rel) => (
                    <article
                        key={rel.id}
                        className="process-config-setup-card rounded-xl border border-alloy-forge/12 bg-white p-3.5 shadow-[0_1px_3px_rgba(24,39,58,0.04)] transition-shadow hover:shadow-[0_4px_14px_rgba(24,39,58,0.06)]"
                        data-testid="data-model-relationship-card"
                    >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-2.5">
                                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/[0.1] text-alloy-bend-pine">
                                    <Link2 size={15} strokeWidth={DATA_MODEL_ICON_STROKE} aria-hidden />
                                </span>
                                <div className="min-w-0">
                                    <h3 className="text-[14px] font-semibold text-alloy-midnight">{rel.label}</h3>
                                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-alloy-midnight/50">
                                        <ArrowRight size={11} strokeWidth={DATA_MODEL_ICON_STROKE} aria-hidden />
                                        <span>{rel.target_label}</span>
                                        <span className="text-alloy-midnight/25">·</span>
                                        <span>{rel.cardinality}</span>
                                        <span className="text-alloy-midnight/25">·</span>
                                        <span
                                            className={
                                                rel.required
                                                    ? "font-medium text-alloy-bend-pine"
                                                    : "text-alloy-midnight/45"
                                            }
                                        >
                                            {rel.required ? "Required" : "Optional"}
                                        </span>
                                    </p>
                                    {rel.role_note ? (
                                        <p className="mt-1.5 text-[11px] leading-snug text-alloy-midnight/45">
                                            {rel.role_note}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <p className="mt-2.5 border-t border-alloy-forge/8 pt-2 text-[10px] text-alloy-midnight/40">
                            Used in: {rel.where_used.join(" · ")}
                        </p>
                    </article>
                ))}
            </div>
        </div>
    );
}
