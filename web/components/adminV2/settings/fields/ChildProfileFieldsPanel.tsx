"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import FieldSurfaceAvailabilityBadges from "@/components/adminV2/settings/fields/FieldSurfaceAvailabilityBadges";
import {
    isGenderFieldDefinition,
    resolveFieldSurfaceAvailability,
    syntheticChildProfileFieldRows,
} from "@/lib/fields/fieldSurfaceAvailability";
import { CUSTOMER_MEMBER_ENTITY_TYPE } from "@/lib/fields/customerMemberFieldRegistry";

function toFieldDef(r: Record<string, unknown>): FieldDef {
    return {
        id: String(r.id),
        org_id: String(r.org_id),
        entity_type: String(r.entity_type),
        field_key: String(r.field_key),
        field_type: String(r.field_type),
        label: r.label != null ? String(r.label) : null,
        description: r.description != null ? String(r.description) : null,
        is_system: Boolean(r.is_system),
        is_required: Boolean(r.is_required),
        is_active: r.is_active !== false,
        is_visible_in_form: r.is_visible_in_form !== false,
        is_visible_in_drawer: r.is_visible_in_drawer !== false,
        is_visible_in_table: r.is_visible_in_table !== false,
        is_visible_in_public_booking: Boolean(r.is_visible_in_public_booking),
        is_filterable: Boolean(r.is_filterable),
        is_sortable: Boolean(r.is_sortable),
        section_key: r.section_key != null ? String(r.section_key) : null,
        sort_order: typeof r.sort_order === "number" ? r.sort_order : Number(r.sort_order) || 0,
        placeholder: r.placeholder != null ? String(r.placeholder) : null,
        help_text: r.help_text != null ? String(r.help_text) : null,
        config: r.config != null && typeof r.config === "object" ? (r.config as Record<string, unknown>) : null,
        requirement_policy: r.requirement_policy ?? null,
        interaction_policy: r.interaction_policy ?? null,
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
    };
}

/**
 * Child profile fields live on customer_member records but operators manage them from the Child entity tab.
 */
export default function ChildProfileFieldsPanel() {
    const [items, setItems] = useState<FieldDef[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `/api/admin/field-definitions?entity_type=${encodeURIComponent(CUSTOMER_MEMBER_ENTITY_TYPE)}`,
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load child profile fields");
            const rows = Array.isArray((json as { items?: unknown[] }).items)
                ? ((json as { items: Record<string, unknown>[] }).items ?? [])
                : [];
            setItems(rows.map(toFieldDef));
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchItems();
    }, [fetchItems]);

    const displayRows = useMemo(() => {
        const manifestRows = syntheticChildProfileFieldRows();
        if (items.length === 0) return manifestRows;
        const byKey = new Map(items.map((row) => [row.field_key, row]));
        return manifestRows.map((manifest) => {
            const saved = byKey.get(manifest.field_key);
            return saved ?? ({ ...manifest, id: manifest.field_key } as FieldDef);
        });
    }, [items]);

    return (
        <div
            className="mb-4 rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.02] px-3 py-3"
            data-testid="child-profile-fields-panel"
        >
            <p className="text-xs font-semibold text-alloy-midnight">Child profile fields</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-alloy-midnight/55">
                Stored on each household child member record (<code className="text-[10px]">customer_member</code>
                ). Edit labels and visibility here; placement on Queue Rows and Focus Panel is configured separately.
            </p>
            {loading ? (
                <p className="mt-2 text-xs text-alloy-midnight/45">Loading profile fields…</p>
            ) : (
                <ul className="mt-3 space-y-2">
                    {displayRows.map((row) => {
                        const badges = resolveFieldSurfaceAvailability(CUSTOMER_MEMBER_ENTITY_TYPE, row);
                        const queueBadge = badges.find((b) => b.surface === "queue_rows");
                        return (
                            <li
                                key={row.field_key}
                                className="rounded-md border border-alloy-stone/12 bg-white px-3 py-2.5"
                                data-testid={`child-profile-field-${row.field_key}`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-medium text-alloy-midnight">
                                            {row.label ?? row.field_key}
                                        </p>
                                        <p className="text-[10px] text-alloy-midnight/45">
                                            Registry key: <span className="font-mono">child.{row.field_key}</span>
                                        </p>
                                        {isGenderFieldDefinition(CUSTOMER_MEMBER_ENTITY_TYPE, row.field_key) &&
                                        queueBadge?.status === "available" ? (
                                            <p
                                                className="mt-1 text-[10px] leading-snug text-alloy-midnight/55"
                                                data-testid="gender-queue-row-available-note"
                                            >
                                                Available inside the{" "}
                                                <span className="font-medium">Children</span> collection on queue rows
                                                when configured in Configuration → Surfaces.
                                            </p>
                                        ) : null}
                                        {isGenderFieldDefinition(CUSTOMER_MEMBER_ENTITY_TYPE, row.field_key) &&
                                        queueBadge?.status === "unavailable" ? (
                                            <p
                                                className="mt-1 text-[10px] leading-snug text-alloy-midnight/55"
                                                data-testid="gender-queue-row-unavailable-note"
                                            >
                                                {queueBadge.reason}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <FieldSurfaceAvailabilityBadges
                                        badges={badges}
                                        compact
                                        testId={`child-profile-field-badges-${row.field_key}`}
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
