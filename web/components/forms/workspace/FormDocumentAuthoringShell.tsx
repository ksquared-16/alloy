"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import {
    opAnswerSurface,
    opCaseFileCanvas,
    opMetadata,
    opMutedMeta,
    opOrientationSurface,
} from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    schema: FormSchemaV1 | null;
    formName: string;
    children: ReactNode;
};

/**
 * Document-oriented framing for form schema authoring (OI-4).
 * Wraps the field editor without changing renderer contracts.
 */
export function FormDocumentAuthoringShell({ schema, formName, children }: Props) {
    const docTitle = schema?.title?.trim() || formName;
    const sectionTitle = schema?.sections[0]?.title?.trim() || "Intake questions";
    const fieldCount = schema?.fields.length ?? 0;

    return (
        <div className={clsx(opCaseFileCanvas, "space-y-4")} data-testid="form-document-authoring-shell">
            <div className={opOrientationSurface}>
                <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">Document design</p>
                <p className="mt-1 text-sm font-semibold text-alloy-midnight">Design this intake like a document — not a database table.</p>
                <p className={clsx("mt-1 max-w-2xl", opMetadata)}>
                    Set the document title and section headers families see first. Fields below compose the body of the intake
                    packet.
                </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
                <div className="min-w-0 space-y-4">
                    <div className="rounded-xl bg-white/95 px-4 py-3 ring-1 ring-alloy-midnight/[0.07]">
                        <p className={opMutedMeta}>Branding / header region</p>
                        <p className={clsx("mt-1 text-sm font-medium text-alloy-midnight")}>{docTitle}</p>
                        <p className={clsx("mt-2", opMetadata)}>
                            Org branding and logo slots will attach here in a future release — title comes from the form name
                            field below.
                        </p>
                    </div>
                    {children}
                </div>

                <aside
                    className="hidden lg:block"
                    data-testid="form-document-preview-frame"
                    aria-label="Recipient preview framing"
                >
                    <p className={clsx("text-xs font-semibold uppercase tracking-wide opacity-60")}>Preview framing</p>
                    <div className={clsx(opAnswerSurface, "mt-2 px-4 py-4")}>
                        <p className="text-base font-semibold text-alloy-midnight">{docTitle}</p>
                        <p className={clsx("mt-3 text-sm font-medium text-alloy-midnight/80")}>{sectionTitle}</p>
                        <p className={clsx("mt-2", opMetadata)}>
                            {fieldCount > 0 ?
                                `${fieldCount} field${fieldCount === 1 ? "" : "s"} in this section`
                            :   "Add fields to build the intake body"}
                        </p>
                        <div className="mt-4 space-y-2 border-t border-alloy-midnight/[0.06] pt-3">
                            {(schema?.fields ?? []).slice(0, 4).map((f) => (
                                <div key={f.id} className="rounded-md bg-white/80 px-2 py-1.5 ring-1 ring-alloy-midnight/[0.05]">
                                    <p className="text-xs font-medium text-alloy-midnight">{f.label}</p>
                                    <p className={opMutedMeta}>{f.required ? "Required" : "Optional"}</p>
                                </div>
                            ))}
                            {fieldCount > 4 ?
                                <p className={opMetadata}>+ {fieldCount - 4} more</p>
                            :   null}
                        </div>
                    </div>
                    <p className={clsx("mt-2", opMutedMeta)}>Preview recipient experience from the lifecycle toolbar when published.</p>
                </aside>
            </div>
        </div>
    );
}
