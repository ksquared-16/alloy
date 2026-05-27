"use client";

import clsx from "clsx";
import { useMemo } from "react";
import type { DocumentBlock, DocumentFieldRegionBlock } from "@/lib/forms/documentComposition";
import { sortDocumentBlocks } from "@/lib/forms/documentComposition";
import {
    COMPOSITION_BRANDING_LOGO_SRC,
    fieldById,
    listFieldRegionBlocks,
    resolveDocumentComposition,
} from "@/lib/forms/documentCompositionAuthoring";
import {
    fieldRegionPreviewFieldClass,
    fieldRegionPreviewLayoutClass,
    fieldRegionPreviewLayoutLabel,
    spacerPreviewHeight,
} from "@/lib/forms/documentCompositionPreviewPresentation";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { FieldRegionPreviewLayout } from "@/lib/forms/documentCompositionPreviewPresentation";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

export type RegionOption = { id: string; label: string };

export type DocumentCompositionPreviewProps = {
    schema: FormSchemaV1;
    className?: string;
    selectedFieldId?: string | null;
    regionOptions?: RegionOption[];
    onSelectField?: (fieldId: string) => void;
    onMoveFieldInRegion?: (regionId: string, fieldId: string, dir: -1 | 1) => void;
    onMoveFieldToRegion?: (fieldId: string, fromRegionId: string, toRegionId: string) => void;
};

type PreviewFieldProps = {
    field: FormField;
    layout: FieldRegionPreviewLayout | undefined;
    regionId: string;
    regionIndex: number;
    regionTotal: number;
    selected: boolean;
    regionOptions: RegionOption[];
    onSelectField?: (fieldId: string) => void;
    onMoveFieldInRegion?: (regionId: string, fieldId: string, dir: -1 | 1) => void;
    onMoveFieldToRegion?: (fieldId: string, fromRegionId: string, toRegionId: string) => void;
};

function PreviewFieldInteractive({
    field,
    layout,
    regionId,
    regionIndex,
    regionTotal,
    selected,
    regionOptions,
    onSelectField,
    onMoveFieldInRegion,
    onMoveFieldToRegion,
}: PreviewFieldProps) {
    const compact = layout === "inline_compact";
    const otherRegions = regionOptions.filter((r) => r.id !== regionId);

    return (
        <div
            className={clsx(
                fieldRegionPreviewFieldClass(layout),
                "group relative cursor-pointer",
                selected && "ring-1 ring-alloy-blue/40"
            )}
            data-testid={`preview-field-${field.id}`}
            onClick={() => onSelectField?.(field.id)}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelectField?.(field.id);
            }}
            role="button"
            tabIndex={0}
        >
            <p className={clsx("text-xs font-medium text-alloy-midnight", compact && "truncate")}>{field.label}</p>
            {!compact ?
                <div className="mt-1 h-6 rounded bg-alloy-stone/30" aria-hidden />
            :   <div className="h-4 w-16 shrink-0 rounded bg-alloy-stone/30" aria-hidden />}

            <div
                className={clsx(
                    "absolute right-1 top-1 flex flex-wrap gap-0.5 rounded bg-white/95 px-1 py-0.5 shadow-sm ring-1 ring-alloy-midnight/10 transition-opacity",
                    selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                data-testid={`preview-field-controls-${field.id}`}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    className="px-1 text-[10px] font-semibold text-alloy-midnight/70 hover:text-alloy-midnight disabled:opacity-30"
                    disabled={regionIndex === 0}
                    aria-label="Move up"
                    data-testid={`preview-field-up-${field.id}`}
                    onClick={() => onMoveFieldInRegion?.(regionId, field.id, -1)}
                >
                    ↑
                </button>
                <button
                    type="button"
                    className="px-1 text-[10px] font-semibold text-alloy-midnight/70 hover:text-alloy-midnight disabled:opacity-30"
                    disabled={regionIndex >= regionTotal - 1}
                    aria-label="Move down"
                    data-testid={`preview-field-down-${field.id}`}
                    onClick={() => onMoveFieldInRegion?.(regionId, field.id, 1)}
                >
                    ↓
                </button>
                {otherRegions.length > 0 ?
                    <select
                        className="max-w-[4.5rem] rounded border-0 bg-transparent py-0 pl-0.5 text-[10px] text-alloy-midnight/70"
                        aria-label="Move to section"
                        defaultValue=""
                        data-testid={`preview-field-move-section-${field.id}`}
                        onChange={(e) => {
                            const target = e.target.value;
                            if (target) onMoveFieldToRegion?.(field.id, regionId, target);
                            e.target.value = "";
                        }}
                    >
                        <option value="" disabled>
                            Section…
                        </option>
                        {otherRegions.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.label}
                            </option>
                        ))}
                    </select>
                :   null}
                <button
                    type="button"
                    className="px-1 text-[10px] font-semibold text-alloy-blue hover:underline"
                    data-testid={`preview-field-edit-${field.id}`}
                    onClick={() => onSelectField?.(field.id)}
                >
                    Edit
                </button>
            </div>
        </div>
    );
}

function PreviewBlock({
    block,
    schema,
    selectedFieldId,
    regionOptions,
    onSelectField,
    onMoveFieldInRegion,
    onMoveFieldToRegion,
}: {
    block: DocumentBlock;
    schema: FormSchemaV1;
    selectedFieldId?: string | null;
    regionOptions: RegionOption[];
    onSelectField?: (fieldId: string) => void;
    onMoveFieldInRegion?: (regionId: string, fieldId: string, dir: -1 | 1) => void;
    onMoveFieldToRegion?: (fieldId: string, fromRegionId: string, toRegionId: string) => void;
}) {
    switch (block.type) {
        case "heading": {
            const Tag = block.level === "h1" ? "h1" : block.level === "h3" ? "h3" : "h2";
            const size =
                block.level === "h1" ? "text-base font-semibold"
                : block.level === "h3" ? "text-xs font-semibold"
                : "text-sm font-semibold";
            return (
                <Tag className={clsx(size, "text-alloy-midnight")} data-testid={`preview-heading-${block.id}`}>
                    {block.content}
                </Tag>
            );
        }
        case "text":
            return (
                <p className={clsx("text-xs leading-relaxed", opMetadata)} data-testid={`preview-text-${block.id}`}>
                    {block.content}
                </p>
            );
        case "image":
            return (
                <div
                    className="flex h-8 items-center justify-center rounded bg-white/80 ring-1 ring-alloy-midnight/[0.06]"
                    data-testid={`preview-image-${block.id}`}
                >
                    <span className="text-[10px] font-medium text-alloy-midnight/45">
                        {block.role === "logo" || block.src === COMPOSITION_BRANDING_LOGO_SRC ? "Logo" : "Image"}
                    </span>
                </div>
            );
        case "divider":
            return (
                <hr
                    className={clsx(
                        "border-t",
                        block.style === "dashed" ? "border-dashed border-alloy-midnight/20"
                        : block.style === "brand" ? "border-alloy-blue/35"
                        : "border-alloy-midnight/12"
                    )}
                    data-testid={`preview-divider-${block.id}`}
                />
            );
        case "spacer":
            return <div className={spacerPreviewHeight(block.size)} data-testid={`preview-spacer-${block.id}`} aria-hidden />;
        case "signature":
            return (
                <div data-testid={`preview-signature-${block.id}`}>
                    <p className={opMutedMeta}>{block.label ?? "Signature"}</p>
                    <div className="mt-1 h-8 rounded bg-white/80 ring-1 ring-alloy-midnight/[0.06]" aria-hidden />
                </div>
            );
        case "field_region": {
            const layout = block.layout ?? "one_column";
            return (
                <section
                    data-testid={`preview-field-region-${block.id}`}
                    data-layout={layout}
                    aria-label={fieldRegionPreviewLayoutLabel(layout)}
                >
                    {block.title ?
                        <p className="text-sm font-medium text-alloy-midnight">{block.title}</p>
                    :   null}
                    {block.helper ?
                        <p className={clsx("mt-0.5", opMutedMeta)}>{block.helper}</p>
                    :   null}
                    <div className={clsx("mt-2", fieldRegionPreviewLayoutClass(layout))}>
                        {block.field_ids.map((fid, fi) => {
                            const field = fieldById(schema, fid);
                            return field ?
                                    <PreviewFieldInteractive
                                        key={fid}
                                        field={field}
                                        layout={layout}
                                        regionId={block.id}
                                        regionIndex={fi}
                                        regionTotal={block.field_ids.length}
                                        selected={selectedFieldId === fid}
                                        regionOptions={regionOptions}
                                        onSelectField={onSelectField}
                                        onMoveFieldInRegion={onMoveFieldInRegion}
                                        onMoveFieldToRegion={onMoveFieldToRegion}
                                    />
                                :   null;
                        })}
                    </div>
                </section>
            );
        }
        default:
            return null;
    }
}

/** Live admin preview with optional reorder controls (FD-12 / FD-13 / FD-14.6). */
export function DocumentCompositionPreview({
    schema,
    className,
    selectedFieldId = null,
    regionOptions: regionOptionsProp,
    onSelectField,
    onMoveFieldInRegion,
    onMoveFieldToRegion,
}: DocumentCompositionPreviewProps) {
    const composition = resolveDocumentComposition(schema);
    const blocks = sortDocumentBlocks(composition.blocks);
    const regionOptions = useMemo(() => {
        if (regionOptionsProp) return regionOptionsProp;
        return listFieldRegionBlocks(composition).map((r: DocumentFieldRegionBlock, i) => ({
            id: r.id,
            label: r.title?.trim() || `Section ${i + 1}`,
        }));
    }, [composition, regionOptionsProp]);

    return (
        <div
            className={clsx(
                "w-full rounded-xl bg-gradient-to-br from-alloy-stone/30 via-white to-alloy-stone/20 px-3 py-3 shadow-[0_1px_3px_rgba(49,57,77,0.07)] ring-1 ring-alloy-midnight/[0.08]",
                className
            )}
            data-testid="document-composition-preview"
        >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Live preview</p>
            <p className={clsx("mt-0.5", opMutedMeta)}>Hover a field to reorder or move sections.</p>
            <div
                className="mt-2 space-y-3 rounded-lg bg-white px-4 py-4 shadow-[0_1px_2px_rgba(49,57,77,0.04)] ring-1 ring-alloy-midnight/[0.06]"
                data-testid="document-composition-preview-canvas"
            >
                {blocks.map((block) => (
                    <PreviewBlock
                        key={block.id}
                        block={block}
                        schema={schema}
                        selectedFieldId={selectedFieldId}
                        regionOptions={regionOptions}
                        onSelectField={onSelectField}
                        onMoveFieldInRegion={onMoveFieldInRegion}
                        onMoveFieldToRegion={onMoveFieldToRegion}
                    />
                ))}
            </div>
        </div>
    );
}
