"use client";

import { useEffect, useState } from "react";
import {
    CARD_WIDTH_FRACTION_KEYS,
    CARD_WIDTH_FRACTIONS,
    type CardWidthFractionKey,
} from "@/lib/layout/layoutBuilderCardWidth";
import {
    EXPERIENCE_BUILDER_CARD_TYPE_LABELS,
    EXPERIENCE_BUILDER_CARD_TYPES,
    type ExperienceBuilderCardType,
} from "@/lib/layout/layoutBuilderCardAuthoring";
import { LAYOUT_BUILDER_WIDGET_OPTIONS } from "@/lib/layout/layoutBuilderPaletteModel";

export type LayoutBuilderAddCardDialogSubmit = {
    title: string;
    widthKey: CardWidthFractionKey;
    cardType: ExperienceBuilderCardType;
    widgetKey?: string;
};

type Props = {
    open: boolean;
    onClose: () => void;
    onSubmit: (input: LayoutBuilderAddCardDialogSubmit) => void;
};

export default function LayoutBuilderAddCardDialog({ open, onClose, onSubmit }: Props) {
    const [title, setTitle] = useState("");
    const [widthKey, setWidthKey] = useState<CardWidthFractionKey>("full");
    const [cardType, setCardType] = useState<ExperienceBuilderCardType>("fields");
    const [widgetKey, setWidgetKey] = useState(LAYOUT_BUILDER_WIDGET_OPTIONS[0]?.key ?? "tasks");

    useEffect(() => {
        if (!open) return;
        setTitle("");
        setWidthKey("full");
        setCardType("fields");
        setWidgetKey(LAYOUT_BUILDER_WIDGET_OPTIONS[0]?.key ?? "tasks");
    }, [open]);

    if (!open) return null;

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
                aria-labelledby="layout-builder-add-card-title"
            >
                <h2 id="layout-builder-add-card-title" className="text-base font-semibold text-alloy-midnight">
                    Add card
                </h2>
                <p className="mt-1 text-xs text-alloy-midnight/55">
                    Name the card, choose its width, and pick what goes inside.
                </p>

                <div className="mt-4 space-y-4">
                    <label className="block text-xs font-medium text-alloy-midnight/75">
                        Card title
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Enrollment Details"
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

                    <label className="block text-xs font-medium text-alloy-midnight/75">
                        Card type
                        <select
                            value={cardType}
                            onChange={(e) => setCardType(e.target.value as ExperienceBuilderCardType)}
                            className="mt-1.5 w-full rounded-lg border border-alloy-forge/15 px-3 py-2 text-sm"
                            data-testid="layout-builder-add-card-type"
                        >
                            {EXPERIENCE_BUILDER_CARD_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {EXPERIENCE_BUILDER_CARD_TYPE_LABELS[type]}
                                </option>
                            ))}
                        </select>
                    </label>

                    {cardType === "widget" ?
                        <label className="block text-xs font-medium text-alloy-midnight/75">
                            KPI widget
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
                                title: title.trim() || "New card",
                                widthKey,
                                cardType,
                                widgetKey: cardType === "widget" ? widgetKey : undefined,
                            })
                        }
                        data-testid="layout-builder-add-card-submit"
                    >
                        Add card
                    </button>
                </div>
            </div>
        </div>
    );
}
