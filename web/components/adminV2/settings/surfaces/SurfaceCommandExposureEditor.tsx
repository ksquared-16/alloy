"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import type { SurfaceConfigSectionKey } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import type { SurfaceCommandExposureKind } from "@/lib/adminV2/settings/surfaces/surfaceCommandExposure";
import { ADMIN_V2_SETTINGS_PROCESSES_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type ExposurePayload = {
    section: SurfaceConfigSectionKey;
    process: {
        departmentId: string;
        processId: string;
        processKey: string;
        processName: string;
        authority: string;
    } | null;
    emptyState: string;
    exposures: Array<{
        kind: SurfaceCommandExposureKind;
        label: string;
        description: string;
        orderingMeaningful: boolean;
        emptyState: string;
        rows: Array<{
            capabilityKey: string;
            label: string;
            purpose: string;
            supported: boolean;
            enabled: boolean;
            orgOwned: boolean;
            platformDefault: boolean;
            blockedReason: string | null;
            orderIndex: number;
        }>;
    }>;
};

function emptyCopy(code: string): { title: string; body: string } {
    if (code === "no_process") {
        return {
            title: "No Business Process associated",
            body: "Command exposure needs a process so Surfaces can list only selected Commands. Configure the process in Business Processes, then return here.",
        };
    }
    if (code === "no_selected_commands") {
        return {
            title: "No Commands selected for this process",
            body: "Business Processes own Command selection. Add Commands to the process, then choose where they appear on this Surface.",
        };
    }
    if (code === "none_valid_for_surface") {
        return {
            title: "No Commands valid for this Surface",
            body: "The process has selected Commands, but none are eligible for this Surface context yet.",
        };
    }
    return {
        title: "Command exposure",
        body: "Choose which process-selected Commands appear on this Surface.",
    };
}

export default function SurfaceCommandExposureEditor(props: {
    section: SurfaceConfigSectionKey;
    departmentId?: string | null;
    processId?: string | null;
    surfaceTitle?: string;
}) {
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [payload, setPayload] = useState<ExposurePayload | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const qs = new URLSearchParams({ section: props.section });
            if (props.departmentId) qs.set("departmentId", props.departmentId);
            if (props.processId) qs.set("processId", props.processId);
            const res = await fetch(
                `/api/admin/surfaces/command-exposure?${qs.toString()}`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as ExposurePayload & { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to load Command exposure");
            setPayload(j);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load Command exposure");
            setPayload(null);
        } finally {
            setLoading(false);
        }
    }, [props.section, props.departmentId, props.processId]);

    useEffect(() => {
        void load();
    }, [load]);

    const toggle = useCallback(
        async (exposureKind: SurfaceCommandExposureKind, capabilityKey: string, enabled: boolean) => {
            const saveId = `${exposureKind}:${capabilityKey}`;
            setSavingKey(saveId);
            setError(null);
            try {
                const res = await fetch("/api/admin/surfaces/command-exposure", {
                    ...workspaceDataFetchInit(),
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        section: props.section,
                        departmentId: props.departmentId ?? payload?.process?.departmentId ?? null,
                        processId: props.processId ?? payload?.process?.processId ?? null,
                        exposureKind,
                        capabilityKey,
                        enabled,
                    }),
                });
                const j = (await res.json().catch(() => ({}))) as ExposurePayload & { error?: string };
                if (!res.ok) throw new Error(j.error ?? "Save failed");
                setPayload(j);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Save failed");
            } finally {
                setSavingKey(null);
            }
        },
        [props.section, props.departmentId, props.processId, payload?.process]
    );

    if (loading) {
        return (
            <p className="text-sm text-alloy-midnight/55" data-testid="surface-command-exposure-loading">
                Loading Command exposure…
            </p>
        );
    }

    if (!payload || payload.emptyState === "no_process") {
        const copy = emptyCopy("no_process");
        return (
            <div
                className="rounded-xl border border-alloy-forge/12 bg-white px-4 py-5"
                data-testid="surface-command-exposure-empty-no-process"
            >
                <h3 className="text-sm font-semibold text-alloy-midnight">{copy.title}</h3>
                <p className="mt-1 text-sm text-alloy-midnight/65">{copy.body}</p>
                <Link
                    href={ADMIN_V2_SETTINGS_PROCESSES_PATH}
                    className="mt-3 inline-flex text-sm font-medium text-alloy-pine underline-offset-2 hover:underline"
                >
                    Open Business Processes
                </Link>
                {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
            </div>
        );
    }

    return (
        <div className="space-y-4" data-testid="surface-command-exposure-editor">
            <header className="rounded-xl border border-alloy-forge/12 bg-white px-4 py-3">
                <h3 className="text-sm font-semibold text-alloy-midnight">
                    Commands on {props.surfaceTitle?.trim() || "this Surface"}
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-alloy-midnight/65">
                    Choose where operators encounter Commands already selected by{" "}
                    <span className="font-medium text-alloy-midnight">{payload.process?.processName}</span>.
                    Surfaces do not add Commands to the process — that stays in Business Processes.
                </p>
            </header>

            {error ? (
                <p className="text-sm text-red-700" data-testid="surface-command-exposure-error">
                    {error}
                </p>
            ) : null}

            {payload.exposures.map((exposure) => {
                const empty = emptyCopy(exposure.emptyState);
                return (
                    <section
                        key={exposure.kind}
                        className="rounded-xl border border-alloy-forge/12 bg-white"
                        data-testid={`surface-command-exposure-${exposure.kind}`}
                    >
                        <div className="border-b border-alloy-forge/8 px-4 py-3">
                            <h4 className="text-sm font-semibold text-alloy-midnight">{exposure.label}</h4>
                            <p className="mt-0.5 text-[12px] text-alloy-midnight/60">{exposure.description}</p>
                        </div>
                        {exposure.rows.length === 0 ? (
                            <div className="px-4 py-4">
                                <p className="text-sm font-medium text-alloy-midnight">{empty.title}</p>
                                <p className="mt-1 text-[13px] text-alloy-midnight/65">{empty.body}</p>
                                {exposure.emptyState === "no_selected_commands" ? (
                                    <Link
                                        href={ADMIN_V2_SETTINGS_PROCESSES_PATH}
                                        className="mt-2 inline-flex text-sm font-medium text-alloy-pine underline-offset-2 hover:underline"
                                    >
                                        Configure process Commands
                                    </Link>
                                ) : null}
                            </div>
                        ) : (
                            <ul className="divide-y divide-alloy-forge/8">
                                {exposure.rows.map((row) => {
                                    const saveId = `${exposure.kind}:${row.capabilityKey}`;
                                    const blocked = Boolean(row.blockedReason) || !row.supported;
                                    return (
                                        <li
                                            key={row.capabilityKey}
                                            className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                                            data-testid={`surface-command-exposure-row-${exposure.kind}-${row.capabilityKey}`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-alloy-midnight">
                                                    {row.label}
                                                </p>
                                                <p className="mt-0.5 text-[12px] text-alloy-midnight/60">
                                                    {row.purpose}
                                                </p>
                                                {row.platformDefault && !row.orgOwned ? (
                                                    <p className="mt-1 text-[11px] text-alloy-midnight/45">
                                                        Platform default — toggle to create an organization
                                                        override.
                                                    </p>
                                                ) : null}
                                                {blocked && row.blockedReason ? (
                                                    <p className="mt-1 text-[11px] text-amber-800">
                                                        {row.blockedReason}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <label className="flex items-center gap-2 text-sm text-alloy-midnight">
                                                <span className="text-[12px] text-alloy-midnight/55">
                                                    {row.enabled ? "Shown" : "Hidden"}
                                                </span>
                                                <input
                                                    type="checkbox"
                                                    checked={row.enabled}
                                                    disabled={blocked || savingKey === saveId}
                                                    onChange={(e) =>
                                                        void toggle(
                                                            exposure.kind,
                                                            row.capabilityKey,
                                                            e.target.checked
                                                        )
                                                    }
                                                    data-testid={`surface-command-exposure-toggle-${exposure.kind}-${row.capabilityKey}`}
                                                />
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
