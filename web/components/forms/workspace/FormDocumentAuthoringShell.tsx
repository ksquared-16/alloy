"use client";

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";
import { DocumentCompositionEditor } from "@/components/admin/forms/documentComposition/DocumentCompositionEditor";
import { DocumentCompositionPreview } from "@/components/admin/forms/documentComposition/DocumentCompositionPreview";
import type { DocumentComposition } from "@/lib/forms/documentComposition";
import {
    listFieldRegionBlocks,
    moveFieldInRegion,
    moveFieldToRegion,
    patchSchemaComposition,
    resolveDocumentComposition,
} from "@/lib/forms/documentCompositionAuthoring";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { opMetadata, opCaseFileCanvas } from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    schema: FormSchemaV1;
    formName: string;
    onChange: (next: FormSchemaV1) => void;
    disabled?: boolean;
};

/**
 * Document authoring shell (FD-8 / FD-12 / FD-13).
 * Native React admin surface — not iframe. See forms-intake-embed-doctrine for public embed boundaries.
 */
export function FormDocumentAuthoringShell({ schema, onChange, disabled = false }: Props) {
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const composition = useMemo(() => resolveDocumentComposition(schema), [schema]);

    const applyComposition = useCallback(
        (next: DocumentComposition) => {
            onChange(patchSchemaComposition(schema, next));
        },
        [onChange, schema]
    );

    const focusField = useCallback((fieldId: string) => {
        if (!fieldId) {
            setSelectedFieldId(null);
            return;
        }
        setSelectedFieldId(fieldId);
        requestAnimationFrame(() => {
            document.getElementById(`form-field-row-${fieldId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
    }, []);

    const handleMoveFieldInRegion = useCallback(
        (regionId: string, fieldId: string, dir: -1 | 1) => {
            applyComposition(moveFieldInRegion(composition, regionId, fieldId, dir));
        },
        [applyComposition, composition]
    );

    const handleMoveFieldToRegion = useCallback(
        (fieldId: string, _fromRegionId: string, toRegionId: string) => {
            applyComposition(moveFieldToRegion(composition, fieldId, toRegionId));
            focusField(fieldId);
        },
        [applyComposition, composition, focusField]
    );

    const handleMoveFieldToRegionFromEditor = useCallback(
        (fieldId: string, toRegionId: string) => {
            applyComposition(moveFieldToRegion(composition, fieldId, toRegionId));
            focusField(fieldId);
        },
        [applyComposition, composition, focusField]
    );

    const regionOptions = useMemo(
        () =>
            listFieldRegionBlocks(composition).map((r, i) => ({
                id: r.id,
                label: r.title?.trim() || `Section ${i + 1}`,
            })),
        [composition]
    );

    return (
        <div className="space-y-3" data-testid="form-document-authoring-shell">
            <p className={opMetadata}>
                Compose the intake document below. Preview updates as you edit — save draft to persist composition.
            </p>

            <div className={clsx(opCaseFileCanvas, "space-y-4")} data-testid="form-document-authoring-studio">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)] lg:items-start">
                <div className="min-w-0">
                    <DocumentCompositionEditor
                        schema={schema}
                        onChange={onChange}
                        disabled={disabled}
                        selectedFieldId={selectedFieldId}
                        onSelectField={focusField}
                        onMoveFieldInRegion={handleMoveFieldInRegion}
                        onMoveFieldToRegion={handleMoveFieldToRegionFromEditor}
                    />
                </div>

                <aside
                    className="hidden lg:sticky lg:top-3 lg:block lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain"
                    data-testid="form-document-preview-frame"
                    aria-label="Document composition preview"
                >
                    <DocumentCompositionPreview
                        schema={schema}
                        selectedFieldId={selectedFieldId}
                        regionOptions={regionOptions}
                        onSelectField={focusField}
                        onMoveFieldInRegion={handleMoveFieldInRegion}
                        onMoveFieldToRegion={handleMoveFieldToRegion}
                    />
                    <p className={clsx("mt-2 text-xs", opMetadata)}>
                        Recipient preview opens from the toolbar when published.
                    </p>
                </aside>
            </div>
            </div>
        </div>
    );
}
