"use client";

import clsx from "clsx";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    fieldPresentationLabel,
    groupDefsFor,
    identityConfigurationFieldKeys,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { composeSummaryAndContextFacts } from "@/lib/adminV2/runtime/focusPanel/identity/composeIdentityContextRows";
import type { IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityNestedFieldLayoutPanel from "@/components/adminV2/settings/surfaces/composer/IdentityNestedFieldLayoutPanel";

type Props = {
    surfaceId: string;
    groupKey: string;
    config: NestedSurfaceConfig;
    onChange: (next: NestedSurfaceConfig) => void;
    onOpenLibrary: () => void;
    onSelectField?: (fieldKey: string) => void;
    className?: string;
};

function labelForField(surfaceId: string, groupKey: string, fieldRef: string, config: NestedSurfaceConfig): string {
    const def = groupDefsFor(surfaceId).find((g) => g.key === groupKey);
    const fallback = fieldRef.replace(/^[a-z_]+\./, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return fieldPresentationLabel(config, groupKey, fieldRef, def?.defaultFieldKeys.includes(fieldRef) ? fieldRef : fallback);
}

function stubRows(config: NestedSurfaceConfig, surfaceId: string, groupKey: string, fieldRefs: string[]): IdentityFieldRowVM[] {
    return fieldRefs.map((fieldRef, index) => ({
        row: index + 1,
        cells: [{
            fieldRef,
            label: labelForField(surfaceId, groupKey, fieldRef, config),
            value: "—",
            labelMode: "visible" as const,
            policy: "read-only" as const,
            editable: false,
            hideWhenEmpty: false,
            width: "full" as const,
        }],
    }));
}

/** Context Facts editor — inherited Summary read-only + incremental facts layout + composed preview. */
export default function IdentityContextFactsPanel({
    surfaceId,
    groupKey,
    config,
    onChange,
    onOpenLibrary,
    onSelectField,
    className,
}: Props) {
    const summaryKeys = identityConfigurationFieldKeys(config, groupKey, "summary");
    const factKeys = identityConfigurationFieldKeys(config, groupKey, "context_facts");
    const inheritedRows = stubRows(config, surfaceId, groupKey, summaryKeys);
    const factRows = stubRows(config, surfaceId, groupKey, factKeys);
    const previewRows = composeSummaryAndContextFacts(inheritedRows, factRows);

    return (
        <div className={clsx("identity-context-facts-panel space-y-4", className)} data-identity-context-facts-panel="true">
            <p className="config-typo-sublabel">
                Context includes all Summary fields automatically. Add only the additional facts needed in the Context view.
            </p>

            <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Inherited from Summary
                </h4>
                {summaryKeys.length === 0 ? (
                    <p className="config-typo-sublabel">No summary fields configured yet.</p>
                ) : (
                    <ul className="space-y-1 rounded-lg border border-dashed border-alloy-stone/20 bg-alloy-stone/5 p-3">
                        {summaryKeys.map((fieldRef) => (
                            <li key={fieldRef} className="text-[12px] text-alloy-midnight/55">
                                {labelForField(surfaceId, groupKey, fieldRef, config)}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight">
                    Context Facts
                </h4>
                <IdentityNestedFieldLayoutPanel
                    surfaceId={surfaceId}
                    groupKey={groupKey}
                    config={config}
                    purpose="context_facts"
                    onChange={onChange}
                    onSelectField={onSelectField}
                    onOpenLibrary={onOpenLibrary}
                />
            </section>

            <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Context Preview
                </h4>
                <ul className="space-y-1 rounded-lg border border-alloy-stone/15 bg-white p-3">
                    {previewRows.flatMap((row) => row.cells).map((cell) => (
                        <li key={cell.fieldRef} className="text-[12px] text-alloy-midnight">
                            {cell.label}
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
