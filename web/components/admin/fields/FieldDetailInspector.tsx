"use client";

import FieldSurfaceAvailabilityBadges from "@/components/admin/fields/FieldSurfaceAvailabilityBadges";
import type { SettingsFieldCatalogEntry } from "@/lib/fields/fieldCatalogForSettings";
import { FIELD_OWNERSHIP_LABELS } from "@/lib/fields/fieldOwnership";
import { FIELD_CONSUMER_SURFACE_LABELS, resolveSettingsCatalogEntryAvailability } from "@/lib/fields/fieldSurfaceAvailability";
import { SURFACE_RESOLVER_OWNERSHIP } from "@/lib/fields/fieldResolverRegistry";

type Props = {
    entry: SettingsFieldCatalogEntry | null;
    onClose: () => void;
};

function resolverOwnerForEntry(entry: SettingsFieldCatalogEntry): string {
    if (entry.computedField) return entry.computedField.resolver_owner;
    if (entry.platformField) {
        const hit = SURFACE_RESOLVER_OWNERSHIP.find((o) => o.surface === "drawer");
        return hit?.owner ?? "Platform native column resolver";
    }
    const hit = SURFACE_RESOLVER_OWNERSHIP.find((o) => o.surface === "forms");
    return hit?.owner ?? "field_definitions registry resolver";
}

export default function FieldDetailInspector({ entry, onClose }: Props) {
    if (!entry) return null;

    const availability = resolveSettingsCatalogEntryAvailability({
        ownership: entry.ownership,
        platformField: entry.platformField,
        computedField: entry.computedField,
        registry: entry.fieldDef
            ? {
                  entity_type: entry.entity_type,
                  field_key: entry.fieldDef.field_key,
                  field_type: entry.fieldDef.field_type,
                  label: entry.fieldDef.label,
                  is_system: entry.fieldDef.is_system,
                  is_active: entry.fieldDef.is_active,
                  is_visible_in_form: entry.fieldDef.is_visible_in_form,
                  is_visible_in_drawer: entry.fieldDef.is_visible_in_drawer,
                  is_visible_in_table: entry.fieldDef.is_visible_in_table,
                  config: entry.fieldDef.config,
              }
            : undefined,
    });

    const available = availability.filter((r) => r.status === "available");
    const unavailable = availability.filter((r) => r.status === "unavailable");
    const computed = entry.computedField;

    return (
        <aside
            className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-alloy-forge/15 bg-white shadow-xl lg:absolute lg:inset-y-0 lg:max-w-none lg:shadow-none"
            data-testid="field-detail-inspector"
            aria-label="Field detail"
        >
            <div className="flex items-start justify-between gap-3 border-b border-alloy-forge/10 px-4 py-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Field inspector
                    </p>
                    <h2 className="truncate text-base font-semibold text-alloy-midnight">{entry.label}</h2>
                    <p className="font-mono text-[11px] text-alloy-midnight/50">{entry.refKey}</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md border border-alloy-forge/15 px-2 py-1 text-xs text-alloy-midnight/60 hover:bg-alloy-stone/10"
                    data-testid="field-detail-inspector-close"
                >
                    Close
                </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
                <section className="space-y-2 text-sm">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                        <dt className="font-medium text-alloy-midnight/55">Ownership</dt>
                        <dd>{FIELD_OWNERSHIP_LABELS[entry.ownership]}</dd>
                        <dt className="font-medium text-alloy-midnight/55">Entity</dt>
                        <dd className="capitalize">{entry.entity_type.replace(/_/g, " ")}</dd>
                        <dt className="font-medium text-alloy-midnight/55">Type</dt>
                        <dd>{entry.field_type}</dd>
                        <dt className="font-medium text-alloy-midnight/55">Source / storage</dt>
                        <dd>{entry.storage_line ?? "—"}</dd>
                        <dt className="font-medium text-alloy-midnight/55">Resolver</dt>
                        <dd className="break-all font-mono text-[10px]">{resolverOwnerForEntry(entry)}</dd>
                        <dt className="font-medium text-alloy-midnight/55">Editable</dt>
                        <dd>{entry.editable ? "Yes" : "No — read-only projection"}</dd>
                    </dl>
                </section>

                {computed ? (
                    <section className="space-y-2 rounded-lg border border-violet-200/40 bg-violet-500/[0.03] p-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-900/70">
                            Calculation
                        </h3>
                        <p className="text-xs leading-relaxed text-alloy-midnight/70">{computed.source_derivation}</p>
                        {computed.dependencies?.length ? (
                            <p className="text-[11px] text-alloy-midnight/60">
                                <span className="font-medium">Dependencies:</span> {computed.dependencies.join(", ")}
                            </p>
                        ) : null}
                        {computed.freshness_note ? (
                            <p className="text-[11px] text-alloy-midnight/60">
                                <span className="font-medium">Freshness:</span> {computed.freshness_note}
                            </p>
                        ) : null}
                        {computed.fallback_behavior ? (
                            <p className="text-[11px] text-alloy-midnight/60">
                                <span className="font-medium">Fallback:</span> {computed.fallback_behavior}
                            </p>
                        ) : null}
                        {computed.example ? (
                            <p className="text-[11px] text-alloy-midnight/60">
                                <span className="font-medium">Example:</span> {computed.example}
                            </p>
                        ) : null}
                        {computed.resolver_status === "future" && computed.unavailable_reason ? (
                            <p className="text-[11px] text-amber-800/80">{computed.unavailable_reason}</p>
                        ) : null}
                    </section>
                ) : null}

                <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Available surfaces
                    </h3>
                    <FieldSurfaceAvailabilityBadges rows={available} />
                    {available.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-[11px] text-alloy-midnight/55">
                            {available.map((row) => (
                                <li key={row.surface}>
                                    {FIELD_CONSUMER_SURFACE_LABELS[row.surface]} — {row.reason}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </section>

                {unavailable.length > 0 ? (
                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                            Unavailable surfaces
                        </h3>
                        <ul className="space-y-1 text-[11px] leading-snug text-alloy-midnight/55">
                            {unavailable.map((row) => (
                                <li key={row.surface} data-surface-unavailable={row.surface}>
                                    <span className="font-medium text-alloy-midnight/70">
                                        {FIELD_CONSUMER_SURFACE_LABELS[row.surface]}:
                                    </span>{" "}
                                    {row.reason}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Used by builders
                    </h3>
                    <p className="text-xs text-alloy-midnight/60">
                        {available.some((r) => r.surface === "queue_row" || r.surface === "focus_panel")
                            ? "Queue Row Builder and Focus Panel Builder when resolver-backed."
                            : "Not exposed in queue/focus builders until resolver-backed."}
                        {available.some((r) => r.surface === "drawer") ? " Drawer Builder supports this field." : ""}
                        {available.some((r) => r.surface === "forms")
                            ? " Forms Builder supports this field."
                            : entry.ownership === "computed"
                              ? " Forms Builder excludes computed fields as editable inputs."
                              : ""}
                    </p>
                </section>
            </div>
        </aside>
    );
}
