"use client";

import type { ReactNode } from "react";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import type { ConfigurationAssignmentEvidence, ConfigurationAssignmentPosture } from "@/lib/configPublication/runtimeModel";

/** Durable assignment identity plus a domain-supplied assignment workflow. */
export function ConfigAssignmentRuntime({
    posture,
    assignments,
    activeRevisionId,
    activeRevisionLabel,
    workflow,
    testId = "config-assignment-runtime",
}: {
    posture: ConfigurationAssignmentPosture;
    assignments: ConfigurationAssignmentEvidence[];
    activeRevisionId: string | null;
    activeRevisionLabel: string;
    workflow?: ReactNode;
    testId?: string;
}) {
    return (
        <div className="space-y-4 pb-2" data-testid={testId}>
            <ConfigWorkspaceCard
                title="Current assignments"
                description="Durable Location consumption—not pending selection."
                compact
                testId={`${testId}-current`}
            >
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-alloy-stone/20 pb-3">
                    <div>
                        <p className="text-xl font-semibold tracking-tight text-alloy-midnight">
                            {posture.assignedCount} of {posture.targetCount}
                        </p>
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                            Locations currently assigned
                        </p>
                    </div>
                    <p
                        className={`text-xs font-semibold ${
                            posture.state === "attention" ? "text-alloy-ember"
                            : posture.state === "current" ? "text-alloy-bend-pine"
                            : "text-alloy-midnight/45"
                        }`}
                    >
                        {posture.label}
                    </p>
                </div>
                {assignments.length > 0 ?
                    <ul className="divide-y divide-alloy-stone/20">
                        {assignments.map((assignment) => {
                            const isCurrent =
                                activeRevisionId != null && assignment.revisionId === activeRevisionId;
                            return (
                                <li
                                    key={assignment.locationId}
                                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-alloy-midnight">
                                            {assignment.locationLabel}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-alloy-midnight/45">
                                            Assigned {new Date(assignment.consumedAt).toLocaleString()}
                                        </p>
                                    </div>
                                    <span
                                        className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                            isCurrent ?
                                                "border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
                                            :   "border-alloy-ember/25 bg-alloy-ember/[0.07] text-alloy-ember"
                                        }`}
                                    >
                                        {isCurrent ?
                                            `Consuming ${assignment.revisionNumber ? `Revision ${assignment.revisionNumber}` : activeRevisionLabel}`
                                        : assignment.revisionNumber ?
                                            `Revision ${assignment.revisionNumber} · update available`
                                        :   "Earlier revision · update available"}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                :   <p className="py-5 text-sm text-alloy-midnight/50">
                        No Locations currently consume this configuration.
                    </p>
                }
            </ConfigWorkspaceCard>

            {workflow ?
                <ConfigWorkspaceCard
                    title="Assign published revision"
                    description={`Choose Locations to consume ${activeRevisionLabel}. Existing Location-owned operational truth remains protected.`}
                    compact
                    testId={`${testId}-workflow`}
                >
                    {workflow}
                </ConfigWorkspaceCard>
            :   null}
        </div>
    );
}
