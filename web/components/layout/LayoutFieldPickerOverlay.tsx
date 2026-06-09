"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    catalogGroupDisplayLabel,
    type LayoutCatalogField,
    type LayoutCatalogWidget,
} from "@/lib/layout/fieldCatalog";
import {
    countAvailableFieldsInGroup,
    partitionCatalogFieldsForPicker,
} from "@/lib/layout/layoutFieldPickerHelpers";

const WIDGET_CATEGORY_ORDER = ["Work", "Communication", "Enrollment", "Waitlist", "System"];

export type LayoutFieldPickerCatalogGroup = {
    entityKey: string;
    entityLabel: string;
    groupSubtitle?: string;
    groupDescription?: string;
    fields: LayoutCatalogField[];
};

export type LayoutFieldPickerCatalog = {
    groups: LayoutFieldPickerCatalogGroup[];
    widgets: LayoutCatalogWidget[];
};

type Props = {
    catalog: LayoutFieldPickerCatalog;
    surface: "drawer" | "queue";
    tab: "field" | "widget";
    setTab: (tab: "field" | "widget") => void;
    group: string;
    setGroup: (group: string) => void;
    usedRefKeys: ReadonlySet<string>;
    lastAddedRefKey?: string | null;
    onPickField: (field: LayoutCatalogField) => void;
    onPickWidget: (widget: LayoutCatalogWidget) => void;
    onClose: () => void;
    /** Hide the widgets tab — queue record column builder is fields-only. */
    fieldsOnly?: boolean;
};

function FieldPickerRow({
    field,
    used,
    justAdded,
    onPick,
}: {
    field: LayoutCatalogField;
    used: boolean;
    justAdded: boolean;
    onPick: () => void;
}) {
    return (
        <button
            type="button"
            data-testid={`layout-field-picker-option-${field.refKey}`}
            onClick={onPick}
            className={[
                "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                justAdded
                    ? "border-[#2f6df6] bg-[#eef4ff]"
                    : used
                      ? "border-[#e6e8ec] bg-[#fafbfc] text-[#7a8499] hover:bg-[#f4f6f9]"
                      : "border-[#e6e8ec] hover:border-[#c5d4f7] hover:bg-[#f5f8ff]",
            ].join(" ")}
        >
            <span className="min-w-0 truncate font-medium text-[#31394d]">{field.fieldLabel}</span>
            <span className="shrink-0 rounded bg-[#f4f6f9] px-1.5 py-0.5 font-mono text-[10px] text-[#9aa4bf]">
                {field.refKey.split(".").pop()}
            </span>
        </button>
    );
}

export default function LayoutFieldPickerOverlay({
    catalog,
    surface,
    tab,
    setTab,
    group,
    setGroup,
    usedRefKeys,
    lastAddedRefKey,
    onPickField,
    onPickWidget,
    onClose,
    fieldsOnly = false,
}: Props) {
    const [searchQuery, setSearchQuery] = useState("");
    const [showUsedFields, setShowUsedFields] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    const activeGroup = catalog.groups.find((g) => g.entityKey === group) ?? catalog.groups[0];
    const groupFields = activeGroup?.fields ?? [];

    useEffect(() => {
        setSearchQuery("");
        setShowUsedFields(false);
    }, [group]);

    useEffect(() => {
        if (tab === "field") searchRef.current?.focus();
    }, [tab, group]);

    const { available, used } = useMemo(
        () => partitionCatalogFieldsForPicker(groupFields, usedRefKeys, searchQuery),
        [groupFields, usedRefKeys, searchQuery],
    );

    const groupCounts = useMemo(
        () =>
            new Map(
                catalog.groups.map((g) => [g.entityKey, countAvailableFieldsInGroup(g.fields, usedRefKeys)] as const),
            ),
        [catalog.groups, usedRefKeys],
    );

    const widgetIsRelevant = (w: LayoutCatalogWidget) => !w.relevantSurfaces || w.relevantSurfaces.includes(surface);
    const byCategory = WIDGET_CATEGORY_ORDER.map((cat) => ({
        cat,
        widgets: catalog.widgets.filter((w) => (w.category ?? "Work") === cat),
    })).filter((x) => x.widgets.length > 0);

    const hiddenUsedCount = used.length;
    const noResults = available.length === 0 && (!showUsedFields || used.length === 0);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
            onClick={onClose}
            data-testid="layout-field-picker-overlay"
        >
            <div
                className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#e6e8ec] bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-[#e6e8ec] px-4 py-3">
                    {fieldsOnly ? (
                        <h2 className="text-sm font-semibold text-[#1d2433]">Add field</h2>
                    ) : (
                        <div className="flex gap-1 rounded-lg bg-[#f4f6f9] p-0.5">
                            <button
                                type="button"
                                data-testid="layout-field-picker-tab-fields"
                                onClick={() => setTab("field")}
                                className={`rounded-md px-3 py-1.5 text-sm ${tab === "field" ? "bg-white font-medium text-[#1d2433] shadow-sm" : "text-[#59678b]"}`}
                            >
                                Fields
                            </button>
                            <button
                                type="button"
                                data-testid="layout-field-picker-tab-widgets"
                                onClick={() => setTab("widget")}
                                className={`rounded-md px-3 py-1.5 text-sm ${tab === "widget" ? "bg-white font-medium text-[#1d2433] shadow-sm" : "text-[#59678b]"}`}
                            >
                                Widgets
                            </button>
                        </div>
                    )}
                    <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-[#59678b] hover:bg-[#f4f6f9]">
                        Close
                    </button>
                </div>

                {fieldsOnly || tab === "field" ? (
                    <div className="flex min-h-0 flex-1">
                        <nav
                            className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[#e6e8ec] bg-[#fafbfc] p-2"
                            aria-label="Field entity categories"
                            data-testid="layout-field-picker-entity-nav"
                        >
                            {catalog.groups.map((g) => {
                                const active = g.entityKey === (activeGroup?.entityKey ?? group);
                                const avail = groupCounts.get(g.entityKey) ?? 0;
                                return (
                                    <button
                                        key={g.entityKey}
                                        type="button"
                                        data-testid={`layout-field-picker-entity-${g.entityKey}`}
                                        onClick={() => setGroup(g.entityKey)}
                                        className={[
                                            "flex items-center justify-between gap-1 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                                            active
                                                ? "bg-white font-medium text-[#2f6df6] shadow-sm ring-1 ring-[#dbe7ff]"
                                                : "text-[#59678b] hover:bg-white/80 hover:text-[#31394d]",
                                        ].join(" ")}
                                    >
                                        <span className="min-w-0 leading-snug">{g.entityLabel}</span>
                                        <span
                                            className={[
                                                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                                                active ? "bg-[#eef4ff] text-[#2f6df6]" : "bg-[#eef1f6] text-[#9aa4bf]",
                                            ].join(" ")}
                                        >
                                            {avail}
                                        </span>
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="flex min-w-0 flex-1 flex-col">
                            <div className="border-b border-[#e6e8ec] px-4 py-3">
                                <h2 className="text-sm font-semibold text-[#1d2433]">
                                    {activeGroup ? catalogGroupDisplayLabel(activeGroup) : "Fields"}
                                </h2>
                                {activeGroup?.groupDescription ? (
                                    <p className="mt-0.5 text-[11px] leading-snug text-[#59678b]">{activeGroup.groupDescription}</p>
                                ) : null}
                                <div className="relative mt-2">
                                    <input
                                        ref={searchRef}
                                        type="search"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder={`Search ${activeGroup?.entityLabel ?? "entity"} fields…`}
                                        data-testid="layout-field-picker-search"
                                        className="w-full rounded-md border border-[#e6e8ec] py-2 pl-3 pr-3 text-sm placeholder:text-[#9aa4bf] focus:border-[#2f6df6] focus:outline-none focus:ring-2 focus:ring-[#dbe7ff]"
                                    />
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                                {noResults ? (
                                    <p className="py-8 text-center text-sm text-[#9aa4bf]">
                                        {searchQuery.trim()
                                            ? `No ${activeGroup?.entityLabel ?? "entity"} fields match “${searchQuery.trim()}”.`
                                            : showUsedFields
                                              ? "No fields in this category."
                                              : "All fields in this category are already on the layout."}
                                    </p>
                                ) : (
                                    <div className="flex flex-col gap-1.5">
                                        {available.map((f) => (
                                            <FieldPickerRow
                                                key={f.refKey}
                                                field={f}
                                                used={false}
                                                justAdded={lastAddedRefKey === f.refKey}
                                                onPick={() => onPickField(f)}
                                            />
                                        ))}

                                        {showUsedFields && used.length > 0 ? (
                                            <>
                                                {available.length > 0 ? (
                                                    <div className="my-2 border-t border-dashed border-[#e6e8ec] pt-2 text-[10px] font-semibold uppercase tracking-wide text-[#9aa4bf]">
                                                        Already on layout
                                                    </div>
                                                ) : null}
                                                {used.map((f) => (
                                                    <FieldPickerRow
                                                        key={f.refKey}
                                                        field={f}
                                                        used
                                                        justAdded={lastAddedRefKey === f.refKey}
                                                        onPick={() => onPickField(f)}
                                                    />
                                                ))}
                                            </>
                                        ) : null}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between gap-3 border-t border-[#e6e8ec] px-4 py-2.5">
                                <label className="flex cursor-pointer items-center gap-2 text-xs text-[#59678b]">
                                    <input
                                        type="checkbox"
                                        checked={showUsedFields}
                                        onChange={(e) => setShowUsedFields(e.target.checked)}
                                        data-testid="layout-field-picker-show-used"
                                        className="rounded border-[#cdd5e4]"
                                    />
                                    Show fields already used
                                    {hiddenUsedCount > 0 && !showUsedFields ? (
                                        <span className="text-[#9aa4bf]">({hiddenUsedCount})</span>
                                    ) : null}
                                </label>
                                <span className="text-[11px] text-[#9aa4bf]">
                                    {available.length} available
                                    {showUsedFields && used.length > 0 ? ` · ${used.length} used` : ""}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        <div className="flex flex-col gap-3">
                            {byCategory.map(({ cat, widgets }) => (
                                <div key={cat}>
                                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#9aa4bf]">{cat}</div>
                                    <div className="flex flex-col gap-1">
                                        {widgets.map((w) => {
                                            const relevant = widgetIsRelevant(w);
                                            return (
                                                <button
                                                    key={w.widgetKey}
                                                    type="button"
                                                    disabled={!relevant}
                                                    onClick={() => relevant && onPickWidget(w)}
                                                    title={
                                                        relevant
                                                            ? w.description
                                                            : `${w.description ?? ""} — available on ${(w.relevantSurfaces ?? []).join("/")} cards`
                                                    }
                                                    className={`flex items-start justify-between gap-2 rounded border border-[#e6e8ec] px-2 py-1.5 text-left text-sm ${relevant ? "hover:bg-[#f5f8ff]" : "opacity-50"}`}
                                                >
                                                    <span className="min-w-0">
                                                        <span className="font-medium text-[#31394d]">{w.label}</span>
                                                        {w.description ? (
                                                            <span className="block text-[11px] text-[#59678b]">{w.description}</span>
                                                        ) : null}
                                                    </span>
                                                    {!relevant ? (
                                                        <span className="shrink-0 rounded bg-[#f4f6f9] px-1.5 py-0.5 text-[10px] text-[#9aa4bf]">
                                                            queue only
                                                        </span>
                                                    ) : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
