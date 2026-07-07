"use client";

import type { PlatformFieldDefinition } from "@/lib/fields/platformFieldCatalog";
import FieldSurfaceAvailabilityBadges from "@/components/admin/fields/FieldSurfaceAvailabilityBadges";
import { resolvePlatformFieldSurfaceAvailability } from "@/lib/fields/fieldSurfaceAvailability";

type Props = {
    row: PlatformFieldDefinition;
    sectionLabel?: string;
};

export default function PlatformFieldSettingsCard({ row, sectionLabel }: Props) {
    const availability = resolvePlatformFieldSurfaceAvailability(row);

    return (
        <article
            className="rounded-xl border border-alloy-forge/15 bg-alloy-pine/[0.02] p-4 shadow-sm"
            data-testid="platform-field-card"
            data-field-key={row.field_key}
            data-entity-type={row.entity_type}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-alloy-midnight">{row.label}</h3>
                        <span
                            className="rounded-full border border-alloy-forge/25 bg-alloy-forge/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/65"
                            data-testid="platform-field-badge"
                        >
                            Platform field
                        </span>
                    </div>
                    <p className="font-mono text-[11px] text-alloy-midnight/50" data-testid="platform-field-ref-key">
                        {row.refKey}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-alloy-midnight/60">
                        <span>
                            <span className="font-medium text-alloy-midnight/75">Type:</span> {row.field_type}
                        </span>
                        {sectionLabel ? (
                            <span>
                                <span className="font-medium text-alloy-midnight/75">Section:</span> {sectionLabel}
                            </span>
                        ) : (
                            <span>
                                <span className="font-medium text-alloy-midnight/75">Section:</span>{" "}
                                {row.section_key.replace(/_/g, " ")}
                            </span>
                        )}
                        <span>
                            <span className="font-medium text-alloy-midnight/75">Storage:</span> {row.storage_table}.
                            {row.storage_column}
                        </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-alloy-midnight/50">
                        Platform-owned field. You can inspect availability and meaning here; storage and key cannot be
                        changed.
                    </p>
                </div>
            </div>
            <div className="mt-3 border-t border-alloy-stone/25 pt-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Surface availability
                </p>
                <FieldSurfaceAvailabilityBadges rows={availability} />
            </div>
        </article>
    );
}
