"use client";

import { useMemo } from "react";
import {
    RUNTIME_METADATA_KEY_INFO,
    categorizeMetadataKeyForEntity,
    metadataRootKeys,
    type RuntimeMetadataEntity,
    type RuntimeMetadataKeyCategory,
} from "@/lib/admin/runtimeEntityMetadataCatalog";

function prettyJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

const CATEGORY_ORDER: RuntimeMetadataKeyCategory[] = [
    "crm_attention",
    "activity_signals",
    "tenant_routing",
    "internal_seed",
    "unknown",
];

const CATEGORY_LABEL: Record<RuntimeMetadataKeyCategory, string> = {
    crm_attention: "CRM — opportunity Needs attention",
    activity_signals: "Activity signals (queue enrichment)",
    tenant_routing: "Tenant / bootstrap routing",
    internal_seed: "Internal / seed markers",
    unknown: "Other keys (not cataloged)",
};

export default function RuntimeMetadataReadOnlyPanel({
    metadata,
    entity,
    isNewRow,
}: {
    metadata: unknown;
    entity: RuntimeMetadataEntity;
    /** True when creating a row — nothing persisted yet */
    isNewRow?: boolean;
}) {
    const keys = useMemo(() => metadataRootKeys(metadata), [metadata]);

    const grouped = useMemo(() => {
        const m = new Map<RuntimeMetadataKeyCategory, string[]>();
        for (const cat of CATEGORY_ORDER) m.set(cat, []);
        for (const k of keys) {
            const cat = categorizeMetadataKeyForEntity(k, entity);
            m.get(cat)!.push(k);
        }
        return m;
    }, [keys, entity]);

    const root = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : null;

    if (isNewRow) {
        return (
            <div className="rounded-lg border border-dashed border-admin-border/80 bg-alloy-stone/5 px-3 py-2.5 text-xs text-alloy-forge/70">
                <div className="font-semibold text-alloy-forge/85">Runtime metadata</div>
                <p className="mt-1 leading-snug">
                    New {entity === "work_unit" ? "work units" : "departments"} start with empty metadata until set via vertical bootstrap,
                    API, or database. This panel shows the effective JSON after save.
                </p>
            </div>
        );
    }

    if (!root || keys.length === 0) {
        return (
            <div className="rounded-lg border border-admin-border/60 bg-white/60 px-3 py-2.5 text-xs text-alloy-forge/70">
                <div className="font-semibold text-alloy-forge/85">Runtime metadata</div>
                <p className="mt-1 leading-snug">
                    No metadata keys on this row (empty object). Opportunity attention and activity signals use defaults unless department or
                    work-unit metadata supplies rules elsewhere.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-admin-border/70 bg-white/70 px-3 py-3 text-xs space-y-3">
            <div>
                <div className="font-semibold text-alloy-forge">Runtime metadata (read-only)</div>
                <p className="mt-0.5 leading-snug text-alloy-forge/65">
                    Values below are stored on this {entity === "work_unit" ? "work unit" : "department"} and read by server/runtime features.
                    Editing is not available here — use bootstrap, admin APIs, or DB procedures.
                </p>
                <p className="mt-1.5 leading-snug text-alloy-forge/55">
                    <span className="font-medium text-alloy-forge/70">CRM — opportunity Needs attention</span> and{" "}
                    <span className="font-medium text-alloy-forge/70">Activity signals</span> are active runtime tunables.{" "}
                    <span className="font-medium text-alloy-forge/70">Tenant / bootstrap</span> and{" "}
                    <span className="font-medium text-alloy-forge/70">Internal / seed</span> are product/bootstrap markers.{" "}
                    <span className="font-medium text-alloy-forge/70">Other keys</span> are not cataloged here (integrations, experiments, or legacy).
                </p>
            </div>

            {CATEGORY_ORDER.map((cat) => {
                const catKeys = grouped.get(cat) ?? [];
                if (!catKeys.length) return null;
                return (
                    <div key={cat} className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/55">{CATEGORY_LABEL[cat]}</div>
                        <ul className="space-y-2">
                            {catKeys.map((k) => {
                                const info = RUNTIME_METADATA_KEY_INFO[k];
                                const value = root[k];
                                return (
                                    <li key={k} className="rounded-md border border-admin-border/50 bg-white/80 px-2.5 py-2">
                                        <div className="font-mono text-[11px] font-semibold text-alloy-pine/90">{k}</div>
                                        {info ? (
                                            <p className="mt-1 leading-snug text-alloy-forge/70">
                                                {!info.entities.includes(entity) ? (
                                                    <span className="font-medium text-amber-800/90">
                                                        Key is normally used on {info.entities.join(", ")} — unexpected on this{" "}
                                                        {entity === "work_unit" ? "work unit" : "department"}.{" "}
                                                    </span>
                                                ) : null}
                                                {info.description}
                                            </p>
                                        ) : (
                                            <p className="mt-1 leading-snug text-alloy-forge/55">
                                                Not cataloged in Settings — may still be used by scripts, integrations, or future features.
                                            </p>
                                        )}
                                        {info?.schemaSummary ? (
                                            <details className="mt-1.5">
                                                <summary className="cursor-pointer text-[11px] font-medium text-alloy-pine/90">
                                                    Reference shape (help)
                                                </summary>
                                                <pre className="mt-1 max-h-40 overflow-auto rounded border border-admin-border/40 bg-alloy-midnight/[0.03] px-2 py-1.5 text-[10px] leading-relaxed text-alloy-forge/75 whitespace-pre-wrap">
                                                    {info.schemaSummary}
                                                </pre>
                                            </details>
                                        ) : null}
                                        <pre className="mt-2 max-h-48 overflow-auto rounded bg-alloy-midnight/[0.04] px-2 py-1.5 text-[10px] leading-relaxed text-alloy-forge/80">
                                            {prettyJson(value)}
                                        </pre>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}
