"use client";

import { ConfigurationInlineButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    CONFIG_OBJECT_CELL,
    ConfigWorkspaceCard,
} from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import type { ConfigurationDistributionRunRecord } from "@/lib/configPublication/types";

/** Cross-revision distribution posture with deterministic retry affordance. */
export function ConfigDistributionRuntime({
    runs,
    revisionLabelByPublicationId,
    locationLabelById,
    onRetry,
    retryingRunId,
    testId = "config-distribution-runtime",
}: {
    runs: ConfigurationDistributionRunRecord[];
    revisionLabelByPublicationId: Map<string, string>;
    locationLabelById: Map<string, string>;
    onRetry?: (runId: string) => void;
    retryingRunId?: string | null;
    testId?: string;
}) {
    const allTargets = runs.flatMap((run) => run.targets);
    const failedCount = allTargets.filter((target) => target.status === "failed").length;
    const succeededCount = allTargets.filter((target) =>
        target.status === "delivered" || target.status === "unchanged",
    ).length;

    return (
        <div className="space-y-4 pb-2" data-testid={testId}>
            <ConfigWorkspaceCard
                title="Distribution posture"
                description="Assignment outcomes across every published revision."
                compact
                testId={`${testId}-summary`}
            >
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className={CONFIG_OBJECT_CELL}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Runs
                        </p>
                        <p className="mt-1 text-xl font-semibold text-alloy-midnight">{runs.length}</p>
                    </div>
                    <div className={CONFIG_OBJECT_CELL}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Successful targets
                        </p>
                        <p className="mt-1 text-xl font-semibold text-alloy-bend-pine">{succeededCount}</p>
                    </div>
                    <div className={CONFIG_OBJECT_CELL}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Failed targets
                        </p>
                        <p className={`mt-1 text-xl font-semibold ${failedCount > 0 ? "text-alloy-ember" : "text-alloy-midnight"}`}>
                            {failedCount}
                        </p>
                    </div>
                </div>
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard
                title="Distribution runs"
                description="Latest outcome for each deterministic assignment run."
                compact
                testId={`${testId}-runs`}
            >
                {runs.length > 0 ?
                    <div className="divide-y divide-alloy-stone/20">
                        {runs.map((run) => {
                            const failed = run.targets.filter((target) => target.status === "failed");
                            const succeeded = run.targets.filter((target) =>
                                target.status === "delivered" || target.status === "unchanged",
                            );
                            return (
                                <section key={run.id} className="py-3 first:pt-0 last:pb-0">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-alloy-midnight">
                                                {revisionLabelByPublicationId.get(run.publicationId) ?? "Published revision"}
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-alloy-midnight/45">
                                                {new Date(run.completedAt ?? run.createdAt).toLocaleString()} · {succeeded.length} succeeded · {failed.length} failed
                                            </p>
                                        </div>
                                        <span
                                            className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                                failed.length > 0 ?
                                                    "border-alloy-ember/25 bg-alloy-ember/[0.07] text-alloy-ember"
                                                :   "border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
                                            }`}
                                        >
                                            {run.status.replaceAll("_", " ")}
                                        </span>
                                    </div>
                                    {failed.length > 0 ?
                                        <div className="mt-2 rounded-lg border border-alloy-ember/15 bg-alloy-ember/[0.035] px-3 py-2">
                                            {failed.map((target) => (
                                                <p key={target.id} className="text-[12px] text-alloy-ember">
                                                    {locationLabelById.get(target.locationId) ?? "Location"}: {target.errorMessage ?? "Assignment failed."}
                                                </p>
                                            ))}
                                            {onRetry ?
                                                <ConfigurationInlineButton
                                                    className="mt-1.5"
                                                    disabled={retryingRunId != null}
                                                    onClick={() => onRetry(run.id)}
                                                >
                                                    {retryingRunId === run.id ? "Retrying…" : "Retry failed assignments"} →
                                                </ConfigurationInlineButton>
                                            :   null}
                                        </div>
                                    :   null}
                                </section>
                            );
                        })}
                    </div>
                :   <p className="py-5 text-sm text-alloy-midnight/50">No distribution runs yet.</p>
                }
            </ConfigWorkspaceCard>
        </div>
    );
}
