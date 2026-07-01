"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StatusDef } from "@/app/api/admin/status-definitions/route";
import {
    ConfigurationDetailCard,
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";
import { formatPersonStatusApplicabilityLabel } from "@/lib/admin/person/personStatusApplicability";

export default function StatusConfigurationDetailPanel({
    status,
    canMutate,
    onSave,
}: {
    status: StatusDef | null;
    canMutate: boolean;
    onSave: (
        id: string,
        patch: Partial<Pick<StatusDef, "status_label" | "sort_order" | "is_active">>,
    ) => Promise<void>;
}) {
    const [label, setLabel] = useState("");
    const [sortOrder, setSortOrder] = useState(100);
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (!status) return;
        setLabel(status.status_label ?? "");
        setSortOrder(status.sort_order);
        setActive(status.is_active);
        setDirty(false);
        setError(null);
    }, [status]);

    if (!status) {
        return (
            <ConfigurationDetailCard testId="status-configuration-workspace-empty">
                <p className="config-typo-sublabel">Select a status to view and edit its settings.</p>
            </ConfigurationDetailCard>
        );
    }

    const showProcessesLink =
        status.entity_type === "opportunities" || status.entity_type === "opportunity_customer_members";

    return (
        <ConfigurationDetailCard testId="status-configuration-detail" title={status.status_label ?? status.status_key}>
            <div className="space-y-4">
                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Label</span>
                    <input
                        type="text"
                        value={label}
                        disabled={!canMutate}
                        onChange={(e) => {
                            setLabel(e.target.value);
                            setDirty(true);
                        }}
                        className="config-runtime-input"
                        data-testid="status-detail-label"
                    />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                        <span className="config-typo-field-label">Sort order</span>
                        <input
                            type="number"
                            value={sortOrder}
                            disabled={!canMutate}
                            onChange={(e) => {
                                setSortOrder(Number(e.target.value) || 0);
                                setDirty(true);
                            }}
                            className="config-runtime-input w-24"
                            data-testid="status-detail-sort"
                        />
                    </label>
                    <label className="flex items-center gap-2 pt-6">
                        <input
                            type="checkbox"
                            checked={active}
                            disabled={!canMutate}
                            onChange={(e) => {
                                setActive(e.target.checked);
                                setDirty(true);
                            }}
                            className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                            data-testid="status-detail-active"
                        />
                        <span className="config-typo-sublabel font-medium text-alloy-midnight/85">Active</span>
                    </label>
                </div>

                <div className="border-t border-alloy-forge/10 pt-3">
                    <span className="config-typo-field-label">Where used</span>
                    {showProcessesLink ?
                        <Link
                            href={ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH}
                            className="mt-1 inline-flex text-sm font-semibold text-alloy-pine hover:underline"
                            data-testid="status-detail-open-processes"
                        >
                            Assigned in Processes →
                        </Link>
                    :   <p className="config-typo-sublabel mt-1">
                            Used in person and enrollment surfaces according to entity type.
                        </p>
                    }
                </div>

                <details className="rounded-lg border border-alloy-forge/14 px-3 py-2">
                    <summary className="config-typo-field-label cursor-pointer">Advanced</summary>
                    <div className="config-typo-meta config-typo-meta-mono mt-2 space-y-1">
                        <p>Status key: {status.status_key}</p>
                        <p>Entity type: {status.entity_type}</p>
                        {status.entity_type === "persons" ?
                            <p>
                                Applicability:{" "}
                                {formatPersonStatusApplicabilityLabel(status.metadata, status.status_key)}
                            </p>
                        :   null}
                        {status.is_system ?
                            <p className="text-amber-800">System status — key is read-only</p>
                        :   null}
                    </div>
                </details>

                {error ?
                    <p className="text-xs text-red-700" role="alert">
                        {error}
                    </p>
                :   null}

                {canMutate ?
                    <div className="flex justify-end gap-2 pt-1">
                        {dirty ?
                            <span className="config-typo-sublabel text-amber-800">Unsaved changes</span>
                        :   null}
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            disabled={!dirty || saving}
                            data-testid="status-detail-save"
                            onClick={() => {
                                void (async () => {
                                    setSaving(true);
                                    setError(null);
                                    try {
                                        await onSave(status.id, {
                                            status_label: label.trim() || null,
                                            sort_order: sortOrder,
                                            is_active: active,
                                        });
                                        setDirty(false);
                                    } catch (e) {
                                        setError(e instanceof Error ? e.message : "Save failed");
                                    } finally {
                                        setSaving(false);
                                    }
                                })();
                            }}
                        >
                            {saving ? "Saving…" : "Save status"}
                        </ConfigurationPrimaryButton>
                    </div>
                :   null}
            </div>
        </ConfigurationDetailCard>
    );
}
