"use client";

import clsx from "clsx";
import type { DocumentBlock } from "@/lib/forms/documentComposition";
import {
    COMPOSITION_BLOCK_COPY,
    COMPOSITION_BRANDING_LOGO_SRC,
    COMPOSITION_FOOTER_TEXT,
} from "@/lib/forms/documentCompositionAuthoring";
import { opContextLabel, opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

const BLOCK_KIND: Record<DocumentBlock["type"], { label: string; hint: string }> = {
    heading: { label: "Section heading", hint: "Title families see at this point in the document." },
    text: { label: "Instruction text", hint: "Guidance, policy language, or context — rich text staging." },
    signature: { label: "Signature region", hint: "Capture area for drawn or typed signatures." },
    image: { label: "Header / logo", hint: "Branding slot — logo or letterhead image." },
    spacer: { label: "Vertical spacer", hint: "Breathing room between document sections." },
    divider: { label: "Divider", hint: "Visual break between content regions." },
    field_region: { label: "Field section", hint: "Groups intake questions into a document region." },
};

type Props = {
    block: DocumentBlock;
    disabled?: boolean;
    onChange: (block: DocumentBlock) => void;
    onRemove?: () => void;
    /** Field section controls (FD-13). */
    canRemoveSection?: boolean;
    onRemoveSection?: () => void;
    onMoveSection?: (dir: -1 | 1) => void;
    sectionPosition?: number;
    sectionTotal?: number;
};

const inputClass =
    "w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm text-alloy-midnight shadow-sm";
const selectClass = "rounded-lg border border-alloy-midnight/10 bg-white px-2 py-1.5 text-sm text-alloy-midnight";

/** Authoring card for a single composition block (FD-10 / FD-13). */
export function DocumentCompositionBlockCard({
    block,
    disabled = false,
    onChange,
    onRemove,
    canRemoveSection = false,
    onRemoveSection,
    onMoveSection,
    sectionPosition = 0,
    sectionTotal = 1,
}: Props) {
    const meta = BLOCK_KIND[block.type];

    return (
        <div
            className="rounded-xl bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(49,57,77,0.05)] ring-1 ring-alloy-midnight/[0.07]"
            data-testid={`document-block-card-${block.type}-${block.id}`}
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">{meta.label}</p>
                    <p className={clsx("mt-0.5", opMutedMeta)}>{meta.hint}</p>
                </div>
                {onRemove && block.type !== "field_region" ?
                    <button
                        type="button"
                        className="text-xs font-semibold text-alloy-ember hover:underline disabled:opacity-40"
                        disabled={disabled}
                        onClick={onRemove}
                        data-testid={`document-block-remove-${block.id}`}
                    >
                        Remove
                    </button>
                :   null}
            </div>

            {block.type === "heading" ?
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label className="block space-y-0.5">
                        <span className={opContextLabel}>Heading text</span>
                        <input
                            className={inputClass}
                            disabled={disabled}
                            value={block.content}
                            onChange={(e) => onChange({ ...block, content: e.target.value })}
                            data-testid={`document-block-heading-content-${block.id}`}
                        />
                    </label>
                    <label className="block space-y-0.5">
                        <span className={opContextLabel}>Level</span>
                        <select
                            className={selectClass}
                            disabled={disabled}
                            value={block.level ?? "h2"}
                            onChange={(e) =>
                                onChange({ ...block, level: e.target.value as "h1" | "h2" | "h3" })
                            }
                        >
                            <option value="h1">Document title</option>
                            <option value="h2">Section</option>
                            <option value="h3">Subsection</option>
                        </select>
                    </label>
                </div>
            :   null}

            {block.type === "text" ?
                <label className="mt-2 block space-y-0.5">
                    <span className={opContextLabel}>Instruction copy</span>
                    <textarea
                        className={clsx(inputClass, "min-h-[4rem]")}
                        disabled={disabled}
                        value={block.content}
                        placeholder="Explain what families should do in this section…"
                        onChange={(e) => onChange({ ...block, content: e.target.value })}
                        data-testid={`document-block-text-content-${block.id}`}
                    />
                    <p className={opMetadata}>Rich text formatting ships in a later pass — plain text for now.</p>
                </label>
            :   null}

            {block.type === "signature" ?
                <div className="mt-2 rounded-lg border border-dashed border-alloy-pine/30 bg-alloy-pine/[0.04] px-3 py-3">
                    <label className="block space-y-0.5">
                        <span className={opContextLabel}>Signature label</span>
                        <input
                            className={inputClass}
                            disabled={disabled}
                            value={block.label ?? "Signature"}
                            onChange={(e) => onChange({ ...block, label: e.target.value })}
                        />
                    </label>
                    {block.field_id ?
                        <p className={clsx("mt-2", opMetadata)}>Bound to field: {block.field_id}</p>
                    :   <p className={clsx("mt-2", opMetadata)}>Placeholder region — add a signature question in the field section below.</p>}
                    <div className="mt-2 h-10 rounded-md bg-white/80 ring-1 ring-alloy-midnight/[0.08]" aria-hidden />
                </div>
            :   null}

            {block.type === "image" ?
                <div className="mt-2 rounded-lg border border-dashed border-alloy-blue/25 bg-alloy-blue/[0.03] px-3 py-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white ring-1 ring-alloy-midnight/[0.08]">
                            <span className="text-[10px] font-semibold uppercase text-alloy-midnight/45">Logo</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <label className="block space-y-0.5">
                                <span className={opContextLabel}>Alt text</span>
                                <input
                                    className={inputClass}
                                    disabled={disabled}
                                    value={block.alt ?? ""}
                                    placeholder="Organization logo"
                                    onChange={(e) => onChange({ ...block, alt: e.target.value || undefined })}
                                />
                            </label>
                        </div>
                        <label className="block space-y-0.5">
                            <span className={opContextLabel}>Role</span>
                            <select
                                className={selectClass}
                                disabled={disabled}
                                value={block.role ?? "logo"}
                                onChange={(e) =>
                                    onChange({ ...block, role: e.target.value as "logo" | "banner" | "inline" })
                                }
                            >
                                <option value="logo">Logo</option>
                                <option value="banner">Banner</option>
                                <option value="inline">Inline</option>
                            </select>
                        </label>
                    </div>
                    {block.src === COMPOSITION_BRANDING_LOGO_SRC ?
                        <p className={clsx("mt-2", opMetadata)}>Upload and asset binding ship in a later pass.</p>
                    :   null}
                </div>
            :   null}

            {block.type === "spacer" ?
                <label className="mt-2 block max-w-[10rem] space-y-0.5">
                    <span className={opContextLabel}>Size</span>
                    <select
                        className={selectClass}
                        disabled={disabled}
                        value={block.size ?? "md"}
                        onChange={(e) => onChange({ ...block, size: e.target.value as "sm" | "md" | "lg" })}
                    >
                        <option value="sm">Small</option>
                        <option value="md">Medium</option>
                        <option value="lg">Large</option>
                    </select>
                </label>
            :   null}

            {block.type === "divider" ?
                <label className="mt-2 block max-w-[10rem] space-y-0.5">
                    <span className={opContextLabel}>Style</span>
                    <select
                        className={selectClass}
                        disabled={disabled}
                        value={block.style ?? "solid"}
                        onChange={(e) =>
                            onChange({ ...block, style: e.target.value as "solid" | "dashed" | "brand" })
                        }
                    >
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="brand">Brand accent</option>
                    </select>
                    <div
                        className={clsx(
                            "mt-2 border-t",
                            block.style === "dashed" ? "border-dashed border-alloy-midnight/20"
                            : block.style === "brand" ? "border-alloy-blue/40"
                            : "border-alloy-midnight/15"
                        )}
                        aria-hidden
                    />
                </label>
            :   null}

            {block.type === "field_region" ?
                <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <button
                            type="button"
                            className="font-semibold text-alloy-midnight/70 hover:text-alloy-midnight hover:underline disabled:opacity-40"
                            disabled={disabled || sectionPosition === 0}
                            onClick={() => onMoveSection?.(-1)}
                            data-testid={`document-section-move-up-${block.id}`}
                        >
                            {COMPOSITION_BLOCK_COPY.moveSectionUp}
                        </button>
                        <button
                            type="button"
                            className="font-semibold text-alloy-midnight/70 hover:text-alloy-midnight hover:underline disabled:opacity-40"
                            disabled={disabled || sectionPosition >= sectionTotal - 1}
                            onClick={() => onMoveSection?.(1)}
                            data-testid={`document-section-move-down-${block.id}`}
                        >
                            {COMPOSITION_BLOCK_COPY.moveSectionDown}
                        </button>
                        {canRemoveSection && onRemoveSection ?
                            <button
                                type="button"
                                className="font-semibold text-alloy-ember hover:underline disabled:opacity-40"
                                disabled={disabled}
                                onClick={onRemoveSection}
                                data-testid={`document-section-remove-${block.id}`}
                            >
                                {COMPOSITION_BLOCK_COPY.removeEmptySection}
                            </button>
                        :   null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block space-y-0.5 sm:col-span-2">
                        <span className={opContextLabel}>Section title</span>
                        <input
                            className={inputClass}
                            disabled={disabled}
                            value={block.title ?? ""}
                            onChange={(e) => onChange({ ...block, title: e.target.value || undefined })}
                        />
                    </label>
                    <label className="block space-y-0.5 sm:col-span-2">
                        <span className={opContextLabel}>Helper text</span>
                        <input
                            className={inputClass}
                            disabled={disabled}
                            value={block.helper ?? ""}
                            placeholder="Optional guidance above questions"
                            onChange={(e) => onChange({ ...block, helper: e.target.value || undefined })}
                        />
                    </label>
                    <label className="block space-y-0.5">
                        <span className={opContextLabel}>Layout</span>
                        <select
                            className={selectClass}
                            disabled={disabled}
                            value={block.layout ?? "one_column"}
                            onChange={(e) =>
                                onChange({
                                    ...block,
                                    layout: e.target.value as
                                        | "one_column"
                                        | "two_column"
                                        | "three_column"
                                        | "inline_compact",
                                })
                            }
                            data-testid={`document-field-region-layout-${block.id}`}
                        >
                            <option value="one_column">One column</option>
                            <option value="two_column">Two columns</option>
                            <option value="three_column">Three columns</option>
                            <option value="inline_compact">Compact rows</option>
                        </select>
                        <p className={opMutedMeta}>Preview and public output only — editor rows stay single-column.</p>
                    </label>
                    <p className={clsx("self-end", opMetadata)}>
                        {block.field_ids.length} question{block.field_ids.length === 1 ? "" : "s"} referenced
                    </p>
                    </div>
                </div>
            :   null}

            {block.type === "text" && block.content === COMPOSITION_FOOTER_TEXT ?
                <p className={clsx("mt-1", opMetadata)}>Footer / branding zone</p>
            :   null}
        </div>
    );
}
