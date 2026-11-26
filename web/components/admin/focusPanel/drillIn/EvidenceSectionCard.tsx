"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, X } from "lucide-react";

import ComposableRegionShell from "@/components/admin/focusPanel/drillIn/ComposableRegionShell";
import InlineSectionControls from "@/components/admin/focusPanel/drillIn/InlineSectionControls";
import NestedSurfaceFieldLayoutSurface, {
    type LayoutSurfaceFieldMeta,
} from "@/components/admin/focusPanel/drillIn/NestedSurfaceFieldLayoutSurface";
import NestedSurfaceAddField from "@/components/admin/focusPanel/drillIn/NestedSurfaceAddField";
import {
    isEvidenceSection,
    setNestedGroupEnabled,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

type Props = {
    surfaceId: string;
    groupKey: string;
    label: string;
    fields: LayoutSurfaceFieldMeta[];
    defaultCollapsed?: boolean;
};

/**
 * Evidence archive section — card shell with collapse, reorder, remove, and one Add field.
 */
export default function EvidenceSectionCard({
    surfaceId,
    groupKey,
    label,
    fields,
    defaultCollapsed = false,
}: Props) {
    const composer = useFocusPanelComposer();
    const composing = composer?.isComposingSurface(surfaceId) ?? false;
    const config = composer?.configFor(surfaceId);
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    const canRemove = config ? isEvidenceSection(surfaceId, groupKey) : false;

    return (
        <ComposableRegionShell
            surfaceId={surfaceId}
            groupKey={groupKey}
            label={label}
            className="fp-evidence-section"
            dataAttrs={{ "data-children-evidence-region": groupKey }}
        >
            <header className="fp-evidence-section__header">
                {composing ? (
                    <InlineSectionControls surfaceId={surfaceId} groupKey={groupKey} />
                ) : null}
                <button
                    type="button"
                    className="fp-evidence-section__title-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        setCollapsed((v) => !v);
                    }}
                    aria-expanded={!collapsed}
                >
                    {collapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    )}
                    <span className="alloy-os-child-egroup__title">{label}</span>
                </button>
                {composing && config && canRemove ? (
                    <button
                        type="button"
                        className="fp-evidence-section__remove"
                        aria-label={`Remove ${label} section`}
                        onClick={(e) => {
                            e.stopPropagation();
                            composer?.updateConfig(surfaceId, setNestedGroupEnabled(config, groupKey, false));
                        }}
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                ) : null}
            </header>
            {!collapsed ? (
                <div className="fp-evidence-section__body">
                    <NestedSurfaceFieldLayoutSurface
                        surfaceId={surfaceId}
                        groupKey={groupKey}
                        fields={fields}
                        showAddField={false}
                    />
                    <NestedSurfaceAddField surfaceId={surfaceId} groupKey={groupKey} />
                </div>
            ) : null}
        </ComposableRegionShell>
    );
}
