"use client";

import { useEffect, useState } from "react";
import {
    CARD_WIDTH_FRACTION_KEYS,
    CARD_WIDTH_FRACTIONS,
    type CardWidthFractionKey,
} from "@/lib/layout/layoutBuilderCardWidth";
import {
    EXPERIENCE_BUILDER_PEER_BLOCK_LABELS,
    EXPERIENCE_BUILDER_PEER_BLOCK_TYPES,
    type ExperienceBuilderPeerBlockType,
} from "@/lib/layout/layoutBuilderCardAuthoring";
import {
    EXPERIENCE_BUILDER_PLACEMENT_INTENTS,
    EXPERIENCE_BUILDER_PLACEMENT_LABELS,
    type ExperienceBuilderPlacementIntent,
} from "@/lib/layout/layoutBuilderPlacement";
import { LAYOUT_BUILDER_WIDGET_OPTIONS } from "@/lib/layout/layoutBuilderPaletteModel";

export type LayoutBuilderAddCardDialogSubmit = {
    title: string;
    widthKey: CardWidthFractionKey;
    cardType: ExperienceBuilderPeerBlockType;
    widgetKey?: string;
    placementIntent: ExperienceBuilderPlacementIntent;
};

type Props = {
    open: boolean;
    onClose: () => void;
    onSubmit: (input: LayoutBuilderAddCardDialogSubmit) => void;
};

const BLOCK_TYPE_HINTS: Record<ExperienceBuilderPeerBlockType, string> = {
    fields: "A card with data fields inside.",
    widget: "A single KPI metric tile — no wrapper card.",
    related_list: "A repeating list of related records.",
    text: "Heading or helper copy.",
};

function defaultWidthForType(blockType: ExperienceBuilderPeerBlockType): CardWidthFractionKey {
    return blockType === "widget" ? "third" : "full";
}

function defaultTitleForType(blockType: ExperienceBuilderPeerBlockType): string {
    switch (blockType) {
        case "fields":
            return "Fields card";
        case "widget":
            return "KPI tile";
        case "related_list":
            return "Related list";
        case "text":
            return "Text block";
    }
}

export default function LayoutBuilderAddCardDialog({ open, onClose, onSubmit }: Props) {
    const [blockType, setBlockType] = useState<ExperienceBuilderPeerBlockType>("fields");
    const [title, setTitle] = useState("");
    const [widthKey, setWidthKey] = useState<CardWidthFractionKey>("full");
    const [widgetKey, setWidgetKey] = useState(LAYOUT_BUILDER_WIDGET_OPTIONS[0]?.key ?? "tasks");
    const [placementIntent, setPlacementIntent] = useState<ExperienceBuilderPlacementIntent>("after_selected");

    useEffect(() => {
        if (!open) return;
        setBlockType("fields");
        setTitle("");
        setWidthKey("full");
        setWidgetKey(LAYOUT_BUILDER_WIDGET_OPTIONS[0]?.key ?? "tasks");
        setPlacementIntent("after_selected");
    }, [open]);

    useEffect(() => {
        setWidthKey(defaultWidthForType(blockType));
    }, [blockType]);

    if (!open) return null;

    const titleLabel =
        blockType === "widget" ? "Tile title"
        : blockType === "fields" ? "Card title"
        : blockType === "related_list" ? "List title"
        : "Block title";

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-alloy-midnight/40 p-4"
            data-testid="layout-builder-add-card-dialog"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-2xl border border-alloy-forge/12 bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-labelledby="layout-builder-add-title"
            >
                <h2 id="layout-builder-add-title" className="text-base font-semibold text-alloy-midnight">
                    Add
                </h2>
                <p className="mt-1 text-xs text-alloy-midnight/55">
                    Choose what to add — each option creates the right block immediately.
                </p>

                <div className="mt-4 space-y-4">
                    <fieldset>
                        <legend className="text-xs font-medium text-alloy-midnight/75">What to add</legend>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            {EXPERIENCE_BUILDER_PEER_BLOCK_TYPES.map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    className={`rounded-lg border px-2.5 py-2.5 text-left text-xs transition ${
                                        blockType === type ?
                                            "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine"
                                        :   "border-alloy-forge/12 bg-white text-alloy-midnight/75 hover:border-alloy-pine/25"
                                    }`}
                                    onClick={() => setBlockType(type)}
                                    data-testid={`layout-builder-add-type-${type}`}
                                >
                                    <span className="block font-semibold">{EXPERIENCE_BUILDER_PEER_BLOCK_LABELS[type]}</span>
                                    <span className="mt-0.5 block text-[10px] leading-snug opacity-70">
                                        {BLOCK_TYPE_HINTS[type]}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <label className="block text-xs font-medium text-alloy-midnight/75">
                        {titleLabel}
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder={
                                blockType === "widget" ? "e.g. Open Tasks"
                                : blockType === "fields" ? "e.g. Enrollment Details"
                                : `e.g. ${defaultTitleForType(blockType)}`
                            }
                            className="mt-1.5 w-full rounded-lg border border-alloy-forge/15 px-3 py-2 text-sm"
                            data-testid="layout-builder-add-card-title-input"
                            autoFocus
                        />
                    </label>

                    <fieldset>
                        <legend className="text-xs font-medium text-alloy-midnight/75">Width</legend>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            {CARD_WIDTH_FRACTION_KEYS.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                                        widthKey === key ?
                                            "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine"
                                        :   "border-alloy-forge/12 bg-white text-alloy-midnight/70 hover:border-alloy-pine/25"
                                    }`}
                                    onClick={() => setWidthKey(key)}
                                    data-testid={`layout-builder-add-card-width-${key}`}
                                >
                                    {CARD_WIDTH_FRACTIONS[key].label}
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend className="text-xs font-medium text-alloy-midnight/75">Location</legend>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            {EXPERIENCE_BUILDER_PLACEMENT_INTENTS.map((intent) => (
                                <button
                                    key={intent}
                                    type="button"
                                    className={`rounded-lg border px-2 py-2 text-left text-xs font-medium transition ${
                                        placementIntent === intent ?
                                            "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine"
                                        :   "border-alloy-forge/12 bg-white text-alloy-midnight/70 hover:border-alloy-pine/25"
                                    }`}
                                    onClick={() => setPlacementIntent(intent)}
                                    data-testid={`layout-builder-add-placement-${intent}`}
                                >
                                    {EXPERIENCE_BUILDER_PLACEMENT_LABELS[intent]}
                                </button>
                            ))}
                        </div>
                        <span className="mt-1 block text-[10px] text-alloy-midnight/45">
                            Defaults to after the selected card when one is selected on the canvas.
                        </span>
                    </fieldset>

                    {blockType === "widget" ?
                        <label className="block text-xs font-medium text-alloy-midnight/75">
                            Starting metric
                            <select
                                value={widgetKey}
                                onChange={(e) => setWidgetKey(e.target.value)}
                                className="mt-1.5 w-full rounded-lg border border-alloy-forge/15 px-3 py-2 text-sm"
                                data-testid="layout-builder-add-card-widget"
                            >
                                {LAYOUT_BUILDER_WIDGET_OPTIONS.map((widget) => (
                                    <option key={widget.key} value={widget.key}>
                                        {widget.label}
                                    </option>
                                ))}
                            </select>
                            <span className="mt-1 block text-[10px] text-alloy-midnight/45">
                                You can change the metric and color after adding.
                            </span>
                        </label>
                    :   null}
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        className="rounded-lg border border-alloy-forge/15 px-3 py-2 text-xs font-medium text-alloy-midnight/65 hover:bg-alloy-stone/20"
                        onClick={onClose}
                        data-testid="layout-builder-add-card-cancel"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-lg bg-alloy-pine px-4 py-2 text-xs font-semibold text-white hover:bg-alloy-pine/90"
                        onClick={() =>
                            onSubmit({
                                title: title.replace(/^\s+|\s+$/g, "") || defaultTitleForType(blockType),
                                widthKey,
                                cardType: blockType,
                                widgetKey: blockType === "widget" ? widgetKey : undefined,
                                placementIntent,
                            })
                        }
                        data-testid="layout-builder-add-card-submit"
                    >
                        Add
                    </button>
                </div>
            </div>
        </div>
    );
}
