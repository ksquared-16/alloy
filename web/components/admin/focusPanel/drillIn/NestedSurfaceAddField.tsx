"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import {
    addFieldToNestedGroup,
    availableFieldsForNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";

type Props = {
    surfaceId: string;
    groupKey: string;
    className?: string;
};

/** One Add field control per editable region — shared by layout surface and household groups. */
export default function NestedSurfaceAddField({ surfaceId, groupKey, className = "" }: Props) {
    const composer = useFocusPanelComposer();
    const { tenantFieldDefinitions } = useTenantFieldDefinitions("opportunities");
    const [addOpen, setAddOpen] = useState(false);

    const composing = composer?.isComposingSurface(surfaceId) ?? false;
    const config = composer?.configFor(surfaceId);
    const regionSelected =
        composer?.selection?.kind === "region" &&
        composer.selection.surfaceId === surfaceId &&
        composer.selection.groupKey === groupKey;

    const available = useMemo(
        () =>
            config && composing
                ? availableFieldsForNestedGroup(surfaceId, groupKey, config, tenantFieldDefinitions)
                : [],
        [config, composing, surfaceId, groupKey, tenantFieldDefinitions],
    );

    const mutate = useCallback(
        (next: NestedSurfaceConfig) => composer?.updateConfig(surfaceId, next),
        [composer, surfaceId],
    );

    if (!composing || !composer || !config || !regionSelected) return null;
    if (available.length === 0) return null;

    return (
        <div className={["fp-region-add-field", className].filter(Boolean).join(" ")} data-region-add-field={groupKey}>
            <button
                type="button"
                className="fp-inline-field-list__add"
                data-canvas-add-field={groupKey}
                onClick={(e) => {
                    e.stopPropagation();
                    setAddOpen((v) => !v);
                }}
            >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add field
            </button>
            {addOpen ? (
                <div className="fp-inline-field-library" data-drill-in-field-library={groupKey}>
                    {available.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            className="fp-inline-field-library__item"
                            onClick={(e) => {
                                e.stopPropagation();
                                mutate(addFieldToNestedGroup(config, groupKey, f.key));
                                setAddOpen(false);
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
