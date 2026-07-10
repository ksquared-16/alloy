"use client";

import clsx from "clsx";
import { useMemo } from "react";
import type { FormField, FormSchemaV1, FormSection } from "@/lib/forms/schema";
import { groupFieldsIntoRows } from "@/lib/forms/formRowComposition";
import { PROCESSING_NEEDS_DESTINATION_DESCRIPTION } from "@/lib/pos/processingCase/formDraft/questionResolutionModel";

export type CanvasDropTarget = {
    sectionId: string;
    fieldId: string | null;
    position: "before" | "after";
    rowIntent: "same-line" | "new-line";
    /** Visual slot when hovering a row — left/center/right for same-line inserts */
    rowSlot?: "left" | "center" | "right";
};

function resolveRowDropTarget(
    e: React.DragEvent,
    sectionId: string,
    row: string[]
): CanvasDropTarget {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;

    if (row.length >= 3) {
        const last = row[row.length - 1] ?? null;
        return { sectionId, fieldId: last, position: "after", rowIntent: "new-line" };
    }

    if (row.length === 0) {
        return { sectionId, fieldId: null, position: "after", rowIntent: "new-line" };
    }

    if (relX < 0.34) {
        const first = row[0]!;
        return { sectionId, fieldId: first, position: "before", rowIntent: "same-line", rowSlot: "left" };
    }
    if (relX < 0.67 && row.length >= 2) {
        const mid = row[0]!;
        return { sectionId, fieldId: mid, position: "after", rowIntent: "same-line", rowSlot: "center" };
    }
    const last = row[row.length - 1]!;
    return { sectionId, fieldId: last, position: "after", rowIntent: "same-line", rowSlot: "right" };
}

const TYPE_LABELS: Record<string, string> = {
    text: "Short text",
    text_block: "Text block",
    date: "Date",
    number: "Number",
    boolean: "Yes / No",
    select: "Dropdown",
    multiselect: "Multi-select",
    signature: "Signature",
    file_ref: "File upload",
};

function resolveDropZone(e: React.DragEvent): { position: "before" | "after"; rowIntent: "same-line" | "new-line" } {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;
    const relX = (e.clientX - rect.left) / rect.width;
    if (relY < 0.28) return { position: "before", rowIntent: "new-line" };
    if (relY > 0.72) return { position: "after", rowIntent: "new-line" };
    return { position: relX < 0.5 ? "before" : "after", rowIntent: "same-line" };
}

function InlineTokenText({ value }: { value: string }) {
    const parts = value.split(/(\{[^}]+\})/g).filter(Boolean);
    return (
        <span>
            {parts.map((part, idx) =>
                part.startsWith("{") && part.endsWith("}") ? (
                    <span
                        key={`${part}-${idx}`}
                        className="mx-0.5 inline-flex rounded-full border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-alloy-bend-pine"
                    >
                        {part}
                    </span>
                ) : (
                    <span key={`${part}-${idx}`}>{part}</span>
                )
            )}
        </span>
    );
}

function QuestionBlock({
    field,
    selected,
    editable,
    onSelect,
    onDragStart,
    onDragOver,
    onDrop,
    dropSameLineBefore,
    dropSameLineAfter,
    dropNewLineBefore,
    dropNewLineAfter,
}: {
    field: FormField;
    selected: boolean;
    editable: boolean;
    onSelect: () => void;
    onDragStart?: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: () => void;
    dropSameLineBefore?: boolean;
    dropSameLineAfter?: boolean;
    dropNewLineBefore?: boolean;
    dropNewLineAfter?: boolean;
}) {
    const isMultiline = field.type === "text" && "multiline" in field && field.multiline;
    const isTextBlock = field.type === "text_block";
    return (
        <div
            role="button"
            tabIndex={0}
            draggable={editable}
            data-canvas-field
            data-canvas-field-selected={selected ? true : undefined}
            data-testid={`form-canvas-question-${field.id}`}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onSelect();
                }
            }}
            onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                onDragStart?.();
            }}
            onDragOver={(e) => {
                e.preventDefault();
                onDragOver?.(e);
            }}
            onDrop={(e) => {
                e.preventDefault();
                onDrop?.();
            }}
            className={clsx(
                "group relative min-w-0 flex-1 rounded-[10px] border px-3 py-2.5 pl-5 transition-all duration-150",
                selected
                    ? "border-alloy-bend-pine/45 bg-alloy-bend-pine/[0.08] ring-[3px] ring-alloy-bend-pine/25"
                    : "border-alloy-stone/25 bg-white hover:border-alloy-bend-pine/25 hover:shadow-sm"
            )}
        >
            {editable ? (
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 cursor-grab text-[11px] tracking-tighter text-alloy-midnight/30 opacity-0 transition-opacity group-hover:opacity-100">
                    ⋮⋮
                </span>
            ) : null}
            {dropSameLineBefore ? (
                <div className="absolute -left-1 top-2 bottom-2 w-[3px] rounded bg-alloy-bend-pine shadow-[0_0_8px_rgba(0,162,131,0.35)]" />
            ) : null}
            {dropSameLineAfter ? (
                <div className="absolute -right-1 top-2 bottom-2 w-[3px] rounded bg-alloy-bend-pine shadow-[0_0_8px_rgba(0,162,131,0.35)]" />
            ) : null}
            {dropNewLineBefore ? (
                <div className="absolute -top-1 left-0 right-0 h-[3px] rounded bg-alloy-bend-pine shadow-[0_0_8px_rgba(0,162,131,0.35)]" />
            ) : null}
            {dropNewLineAfter ? (
                <div className="absolute -bottom-1 left-0 right-0 h-[3px] rounded bg-alloy-bend-pine shadow-[0_0_8px_rgba(0,162,131,0.35)]" />
            ) : null}
            <p className="text-[11px] font-semibold text-alloy-midnight">
                {field.label}
                {field.required ? <span className="text-amber-600"> *</span> : null}
                {field.description === PROCESSING_NEEDS_DESTINATION_DESCRIPTION ? (
                    <span
                        className="ml-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-800"
                        data-testid={`form-canvas-needs-destination-${field.id}`}
                    >
                        Needs destination
                    </span>
                ) : null}
            </p>
            {isTextBlock ? (
                <div className="mt-2 rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.08] px-3 py-2 text-[11px] leading-relaxed text-alloy-midnight/65">
                    <InlineTokenText value={field.content || "Authorization language…"} />
                </div>
            ) : (
                <div
                    className={clsx(
                        "mt-1.5 rounded-md border border-alloy-stone/20 bg-alloy-stone/[0.15]",
                        isMultiline ? "h-14" : "h-7"
                    )}
                    aria-hidden
                />
            )}
            <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                {field.type === "text" && isMultiline ? "Long text" : TYPE_LABELS[field.type] ?? field.type}
            </p>
        </div>
    );
}

export default function ProcessingFormCanvas({
    schema,
    selectedFieldId,
    selectedSectionId,
    editable,
    collapsedSectionIds,
    onSelectField,
    onSelectSection,
    onToggleSectionCollapse,
    onAddQuestion,
    onAddSection,
    dragFieldId,
    dropTarget,
    onDragFieldStart,
    onDragFieldOver,
    onDragFieldDrop,
    onSectionDragOver,
}: {
    schema: FormSchemaV1;
    selectedFieldId: string | null;
    selectedSectionId: string | null;
    editable: boolean;
    collapsedSectionIds?: Set<string>;
    onSelectField: (fieldId: string) => void;
    onSelectSection: (sectionId: string) => void;
    onToggleSectionCollapse?: (sectionId: string) => void;
    onAddQuestion: (sectionId: string) => void;
    onAddSection: () => void;
    dragFieldId?: string | null;
    dropTarget?: CanvasDropTarget | null;
    onDragFieldStart?: (fieldId: string) => void;
    onDragFieldOver?: (target: CanvasDropTarget) => void;
    onDragFieldDrop?: () => void;
    onSectionDragOver?: (sectionId: string) => void;
}) {
    const fieldById = useMemo(() => {
        const map = new Map<string, FormField>();
        for (const f of schema.fields) map.set(f.id, f);
        return map;
    }, [schema.fields]);

    return (
        <div className="mx-auto max-w-[720px]" data-surface-canvas-builder="true" data-testid="processing-form-canvas">
            <h2 className="text-[18px] font-bold tracking-tight text-alloy-midnight">{schema.title}</h2>
            <p className="mt-1 text-[12px] text-alloy-midnight/40">Families complete this form in your enrollment flow.</p>
            <div className="mb-6 mt-5 border-b border-alloy-stone/15 pb-5" />

            {schema.sections.map((section: FormSection) => {
                const rows = groupFieldsIntoRows(section.field_ids, fieldById);
                const sectionSelected = selectedSectionId === section.id && !selectedFieldId;
                const collapsed = collapsedSectionIds?.has(section.id) ?? false;
                return (
                    <section
                        key={section.id}
                        data-surface-composer-canvas={`section-${section.id}`}
                        data-testid={`form-canvas-section-${section.id}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelectSection(section.id);
                        }}
                        className={clsx(
                            "group mb-4 overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-150",
                            sectionSelected
                                ? "border-alloy-bend-pine ring-[3px] ring-alloy-bend-pine/30"
                                : "border-alloy-stone/20 hover:border-alloy-bend-pine/20"
                        )}
                    >
                        <header className="flex items-center gap-2 border-b border-alloy-stone/15 bg-alloy-stone/[0.12] px-3.5 py-2.5">
                            <span className="cursor-grab text-[13px] tracking-tighter text-alloy-midnight/30">⋮⋮</span>
                            <button
                                type="button"
                                className="rounded p-0.5 text-[11px] text-alloy-midnight/45 hover:bg-white/80"
                                aria-label={collapsed ? "Expand section" : "Collapse section"}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleSectionCollapse?.(section.id);
                                }}
                            >
                                {collapsed ? "▸" : "▾"}
                            </button>
                            <span className="flex-1 text-[12px] font-semibold text-alloy-midnight" data-section-title={section.title}>
                                {section.title}
                            </span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-alloy-midnight/45">
                                {section.field_ids.length} question{section.field_ids.length === 1 ? "" : "s"}
                            </span>
                            {editable ? (
                                <button
                                    type="button"
                                    className="rounded-md border border-alloy-stone/20 bg-white px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/70 hover:border-alloy-bend-pine/30"
                                    data-canvas-add-field={section.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAddQuestion(section.id);
                                    }}
                                >
                                    + Question
                                </button>
                            ) : null}
                        </header>
                        {!collapsed ? (
                            <div
                                className="space-y-3 p-3.5"
                                onDragOver={(e) => {
                                    if (!editable || !dragFieldId) return;
                                    e.preventDefault();
                                    onSectionDragOver?.(section.id);
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    onDragFieldDrop?.();
                                }}
                            >
                                {rows.length === 0 ? (
                                    <p className="rounded-lg border border-dashed border-alloy-stone/25 py-6 text-center text-[11px] text-alloy-midnight/40">
                                        Drag questions here or add from the library.
                                    </p>
                                ) : (
                                    rows.map((row, rowIdx) => {
                                        const rowDropActive =
                                            !!dragFieldId &&
                                            dropTarget?.sectionId === section.id &&
                                            dropTarget.fieldId != null &&
                                            row.includes(dropTarget.fieldId);
                                        const rowFull = row.length >= 3;
                                        return (
                                        <div
                                            key={`${section.id}-row-${rowIdx}`}
                                            className={clsx(
                                                "group/row relative flex flex-wrap gap-2.5 rounded-lg border bg-white p-1.5 transition-colors",
                                                rowDropActive && dropTarget?.rowIntent === "same-line"
                                                    ? "border-alloy-bend-pine/35 bg-alloy-bend-pine/[0.04]"
                                                    : rowDropActive && dropTarget?.rowIntent === "new-line"
                                                    ? "border-dashed border-alloy-bend-pine/40"
                                                    : "border-alloy-stone/15 hover:border-alloy-stone/25"
                                            )}
                                            data-canvas-line={rowIdx}
                                            data-testid={`form-canvas-row-${section.id}-${rowIdx}`}
                                            onDragOver={(e) => {
                                                if (!editable || !dragFieldId) return;
                                                if ((e.target as HTMLElement).closest("[data-canvas-field]")) return;
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onDragFieldOver?.(resolveRowDropTarget(e, section.id, row));
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                onDragFieldDrop?.();
                                            }}
                                        >
                                            {editable && dragFieldId && !rowFull ? (
                                                <div className="pointer-events-none absolute inset-1.5 z-10 flex gap-1" aria-hidden>
                                                    {(["left", "center", "right"] as const).map((slot) => (
                                                        <div
                                                            key={slot}
                                                            className={clsx(
                                                                "flex flex-1 items-center justify-center rounded-md border border-dashed text-[9px] font-semibold uppercase tracking-wide transition-colors",
                                                                dropTarget?.rowSlot === slot && rowDropActive
                                                                    ? "border-alloy-bend-pine/50 bg-alloy-bend-pine/15 text-alloy-bend-pine"
                                                                    : "border-alloy-stone/20 bg-alloy-stone/[0.04] text-alloy-midnight/25"
                                                            )}
                                                        >
                                                            {slot}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                            {editable && dragFieldId && rowFull ? (
                                                <div className="pointer-events-none absolute -bottom-3 left-0 right-0 z-10 flex justify-center" aria-hidden>
                                                    <span
                                                        className={clsx(
                                                            "rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                                                            rowDropActive && dropTarget?.rowIntent === "new-line"
                                                                ? "border-alloy-bend-pine/50 bg-alloy-bend-pine/15 text-alloy-bend-pine"
                                                                : "border-alloy-stone/20 bg-white text-alloy-midnight/35"
                                                        )}
                                                    >
                                                        New row below
                                                    </span>
                                                </div>
                                            ) : null}
                                            {row.length > 1 ? (
                                                <span className="pointer-events-none absolute -left-1 top-1/2 -translate-y-1/2 select-none text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/25">
                                                    Row
                                                </span>
                                            ) : null}
                                            {row.map((fid) => {
                                                const field = fieldById.get(fid);
                                                if (!field) return null;
                                                const half = field.layout_width === "half";
                                                const third = half && row.length >= 3;
                                                const isTarget = dropTarget?.sectionId === section.id && dropTarget.fieldId === fid;
                                                return (
                                                    <div
                                                        key={fid}
                                                        className={clsx(
                                                            "relative transition-[flex-basis] duration-150",
                                                            third
                                                                ? "min-w-[calc(33.333%-0.4375rem)] flex-[1_1_calc(33.333%-0.4375rem)]"
                                                                : half
                                                                ? "min-w-[calc(50%-0.3125rem)] flex-[1_1_calc(50%-0.3125rem)]"
                                                                : "w-full flex-[1_1_100%]"
                                                        )}
                                                    >
                                                        <QuestionBlock
                                                            field={field}
                                                            selected={selectedFieldId === fid}
                                                            editable={editable}
                                                            onSelect={() => onSelectField(fid)}
                                                            onDragStart={() => onDragFieldStart?.(fid)}
                                                            onDragOver={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                const zone = resolveDropZone(e);
                                                                onDragFieldOver?.({
                                                                    sectionId: section.id,
                                                                    fieldId: fid,
                                                                    ...zone,
                                                                });
                                                            }}
                                                            onDrop={() => onDragFieldDrop?.()}
                                                            dropSameLineBefore={isTarget && dropTarget.rowIntent === "same-line" && dropTarget.position === "before"}
                                                            dropSameLineAfter={isTarget && dropTarget.rowIntent === "same-line" && dropTarget.position === "after"}
                                                            dropNewLineBefore={isTarget && dropTarget.rowIntent === "new-line" && dropTarget.position === "before"}
                                                            dropNewLineAfter={isTarget && dropTarget.rowIntent === "new-line" && dropTarget.position === "after"}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        );
                                    })
                                )}
                                {editable ? (
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-alloy-bend-pine/30 bg-alloy-bend-pine/[0.04] py-2 text-[11px] font-semibold text-alloy-bend-pine opacity-0 transition-opacity group-hover:opacity-100 hover:bg-alloy-bend-pine/[0.07]"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAddQuestion(section.id);
                                        }}
                                    >
                                        + Add question
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                    </section>
                );
            })}

            {editable ? (
                <button
                    type="button"
                    data-testid="form-canvas-add-section"
                    onClick={onAddSection}
                    className="w-full rounded-xl border border-dashed border-alloy-stone/30 py-3.5 text-[12px] font-semibold text-alloy-midnight/45 hover:border-alloy-bend-pine/30 hover:bg-alloy-bend-pine/[0.04] hover:text-alloy-bend-pine"
                >
                    + Add section
                </button>
            ) : null}

            {dragFieldId ? (
                <p className="sr-only" aria-live="polite">
                    Dragging question {dragFieldId}
                </p>
            ) : null}
        </div>
    );
}
