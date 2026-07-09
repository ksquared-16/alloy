"use client";

import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import ComposerFloatingPopover from "@/components/admin/focusPanel/drillIn/ComposerFloatingPopover";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import {
    isNestedGroupEnabled,
    setNestedGroupEnabled,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    CUSTOM_SECTION_OPTION,
    evidenceSectionOptions,
    platformSectionOptions,
} from "@/lib/adminV2/settings/surfaces/sectionCatalog";

type Props = {
    surfaceId: string;
    /** Operational sections vs evidence archive sections. */
    variant?: "operational" | "evidence";
    triggerLabel?: string;
};

/**
 * Surface Composer — Add Section flow (operational or evidence surfaces).
 */
export default function AddSectionMenu({
    surfaceId,
    variant = "operational",
    triggerLabel = "Add section",
}: Props) {
    const composer = useFocusPanelComposer();
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const config = composer?.configFor(surfaceId) ?? null;
    const options = useMemo(
        () => (variant === "evidence" ? evidenceSectionOptions(surfaceId) : platformSectionOptions(surfaceId)),
        [surfaceId, variant],
    );

    // Only offer sections that aren't already enabled.
    const available = useMemo(
        () => options.filter((o) => !(config && isNestedGroupEnabled(config, o.groupKey))),
        [options, config],
    );

    if (!composer || !config) return null;
    if (available.length === 0) return null;

    const addSection = (groupKey: string, semantic: string, customLabel?: string) => {
        composer.updateConfig(
            surfaceId,
            setNestedGroupEnabled(config, groupKey, true, {
                sectionSemantic: semantic,
                sectionLabel: customLabel,
            }),
        );
        composer.select({ kind: "region", surfaceId, groupKey });
        setOpen(false);
    };

    return (
        <div className="fp-add-section-wrap" data-add-section-menu={surfaceId} data-add-section-variant={variant}>
            <button
                ref={triggerRef}
                type="button"
                className="fp-inline-add-section"
                data-add-section-trigger="true"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                <Plus className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden /> {triggerLabel}
            </button>
            <ComposerFloatingPopover
                open={open}
                anchorRef={triggerRef}
                onClose={() => setOpen(false)}
                className="fp-add-section-menu"
            >
                <div role="menu">
                    {available.map((option) => (
                        <button
                            key={option.groupKey}
                            type="button"
                            role="menuitem"
                            className="fp-add-section-menu__item"
                            data-add-section={option.groupKey}
                            data-section-semantic={option.semantic}
                            onClick={() => addSection(option.groupKey, option.semantic)}
                        >
                            <span className="fp-add-section-menu__label">{option.label}</span>
                            {option.description ? (
                                <span className="fp-add-section-menu__desc">{option.description}</span>
                            ) : null}
                        </button>
                    ))}
                    <button
                        type="button"
                        role="menuitem"
                        className="fp-add-section-menu__item fp-add-section-menu__item--custom"
                        data-add-section-custom="true"
                        onClick={() => {
                            const label = window.prompt("Name this section");
                            const trimmed = label?.trim();
                            if (!trimmed) return;
                            addSection(CUSTOM_SECTION_OPTION.groupKey, CUSTOM_SECTION_OPTION.semantic, trimmed);
                        }}
                    >
                        <span className="fp-add-section-menu__label">{CUSTOM_SECTION_OPTION.label}</span>
                        <span className="fp-add-section-menu__desc">{CUSTOM_SECTION_OPTION.description}</span>
                    </button>
                </div>
            </ComposerFloatingPopover>
        </div>
    );
}
