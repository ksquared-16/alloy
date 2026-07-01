"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import {
    currentVersionId,
    type EffectiveDatedVersionRow,
} from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";
import {
    EffectiveDatedConfigurationEditor,
    type EditorExtraForm,
    type EditorField,
} from "@/components/adminV2/settings/configurationRuntime/EffectiveDatedConfigurationEditor";
import {
    ORG_SCOPE_SELECTION,
    ScopePicker,
    type ScopeOptions,
    type ScopeSelection,
} from "@/components/adminV2/settings/configurationRuntime/ScopePicker";

/**
 * Generic authoring group for one operational-rule category (Operational
 * Configuration V1, Phase 3; scope picker added Phase 4). Groups a category's
 * rows into lineages and renders the shared EffectiveDatedConfigurationEditor
 * once per lineage (timeline + supersede/retire/void) plus an inline "add" editor
 * for a new lineage. The add form chooses scope via the labeled ScopePicker (no
 * raw IDs). One versioning UX, four domains. No drawers.
 */

export type CreateValues = {
    effectiveStart: string;
    fields: Record<string, string>;
    extra: Record<string, unknown>;
};

/** Read the scope selection an add form captured via the ScopePicker extra slot. */
export function readScopeSelection(extra: Record<string, unknown>): ScopeSelection {
    const s = extra.scope;
    return s && typeof s === "object" ? (s as ScopeSelection) : ORG_SCOPE_SELECTION;
}

/** Build the add-form scope sub-form (labeled picker), composed with any caller extra. */
function buildScopeExtra(scopeOptions: ScopeOptions): EditorExtraForm {
    return {
        initial: () => ({ scope: ORG_SCOPE_SELECTION }),
        render: (state, setState, busy) => (
            <ScopePicker
                value={readScopeSelection(state)}
                onChange={(scope) => setState({ ...state, scope })}
                options={scopeOptions}
                disabled={busy}
            />
        ),
    };
}

function composeExtra(a?: EditorExtraForm, b?: EditorExtraForm): EditorExtraForm | undefined {
    if (!a) return b;
    if (!b) return a;
    return {
        initial: () => ({ ...a.initial(), ...b.initial() }),
        render: (state, setState, busy) => (
            <Fragment>
                {a.render(state, setState, busy)}
                {b.render(state, setState, busy)}
            </Fragment>
        ),
    };
}

function pickWorking<T extends EffectiveDatedVersionRow>(lineage: T[], todayYmd: string): T {
    const currentId = currentVersionId(lineage, todayYmd);
    return (
        lineage.find((r) => r.id === currentId) ??
        [...lineage].sort((a, b) => (a.effective_start < b.effective_start ? 1 : -1))[0]
    );
}

export type ConfigRuleAuthoringGroupProps<T extends EffectiveDatedVersionRow> = {
    categoryTitle: string;
    testIdPrefix: string;
    rows: T[];
    todayYmd: string;
    canMutate: boolean;
    busy: boolean;
    /** Group rows into version lineages by a stable logical identity. */
    lineageKey: (row: T) => string;
    /** Title for one lineage's editor (from its working version). */
    lineageTitle: (working: T) => string;
    /** Editable fields for "create future version" (prefilled from working). */
    versionFields: (working: T) => EditorField[];
    /** Editable fields for "add new lineage". */
    addFields: EditorField[];
    /** Value summary rendered per version in the timeline. */
    renderVersionSummary: (row: T) => ReactNode;
    /** Optional structured sub-form (ratio tiers); `working` is null for add. */
    extraFormFor?: (working: T | null) => EditorExtraForm | undefined;
    /** Labeled scope options for the add-form scope picker. */
    scopeOptions: ScopeOptions;
    /** Add-form label + empty-state. */
    addLabel: string;
    emptyCopy: string;
    /** Persist a brand-new lineage. */
    onCreate: (values: CreateValues) => Promise<void>;
    /** Persist a new version of an existing lineage. */
    onVersion: (workingId: string, values: CreateValues) => Promise<void>;
    onRetire: (workingId: string, effectiveEnd: string) => Promise<void>;
    onVoid: (rowId: string) => Promise<void>;
    /** Resolved-value preview shown on the first lineage editor (optional). */
    resolvedPreview?: ReactNode;
};

export function ConfigRuleAuthoringGroup<T extends EffectiveDatedVersionRow>({
    categoryTitle,
    testIdPrefix,
    rows,
    todayYmd,
    canMutate,
    busy,
    lineageKey,
    lineageTitle,
    versionFields,
    addFields,
    renderVersionSummary,
    extraFormFor,
    scopeOptions,
    addLabel,
    emptyCopy,
    onCreate,
    onVersion,
    onRetire,
    onVoid,
    resolvedPreview,
}: ConfigRuleAuthoringGroupProps<T>) {
    // The add form chooses scope via the labeled picker, composed with any
    // domain-specific extra (e.g. ratio tiers).
    const addExtraForm = composeExtra(buildScopeExtra(scopeOptions), extraFormFor?.(null));
    const lineages = useMemo(() => {
        const groups = new Map<string, T[]>();
        for (const r of rows) {
            const key = lineageKey(r);
            const list = groups.get(key) ?? [];
            list.push(r);
            groups.set(key, list);
        }
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [rows, lineageKey]);

    return (
        <section className="space-y-2" data-testid={`${testIdPrefix}-group`}>
            <div className="flex items-center justify-between">
                <h3 className="config-typo-section-title text-alloy-midnight">
                    {categoryTitle} ({lineages.length})
                </h3>
            </div>

            {lineages.length === 0 && !canMutate ? (
                <p className="config-typo-sublabel text-alloy-forge/60" data-testid={`${testIdPrefix}-empty`}>
                    {emptyCopy}
                </p>
            ) : null}

            {lineages.map(([key, lineageRows], idx) => {
                const working = pickWorking(lineageRows, todayYmd);
                return (
                    <EffectiveDatedConfigurationEditor<T>
                        key={key}
                        title={lineageTitle(working)}
                        versions={lineageRows}
                        todayYmd={todayYmd}
                        fields={versionFields(working)}
                        extraForm={extraFormFor?.(working)}
                        canMutate={canMutate}
                        busy={busy}
                        testIdPrefix={`${testIdPrefix}-${idx}`}
                        renderVersionSummary={renderVersionSummary}
                        resolvedPreview={idx === 0 ? resolvedPreview : undefined}
                        onCreateVersion={(values) => onVersion(working.id, values)}
                        onRetire={({ effectiveEnd }) => onRetire(working.id, effectiveEnd)}
                        onVoid={(row) => onVoid(row.id)}
                    />
                );
            })}

            {canMutate ? (
                <EffectiveDatedConfigurationEditor<T>
                    title={addLabel}
                    versions={[]}
                    todayYmd={todayYmd}
                    fields={addFields}
                    extraForm={addExtraForm}
                    canMutate={canMutate}
                    busy={busy}
                    emptyCreateLabel={addLabel}
                    testIdPrefix={`${testIdPrefix}-new`}
                    renderVersionSummary={() => null}
                    resolvedPreview={lineages.length === 0 ? resolvedPreview : undefined}
                    onCreateVersion={(values) => onCreate(values)}
                    onRetire={async () => undefined}
                    onVoid={async () => undefined}
                />
            ) : null}
        </section>
    );
}
