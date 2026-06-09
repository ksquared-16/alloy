"use client";

import { useEffect, useState } from "react";
import { ActionWorkspaceBosNeuralPulse } from "@/components/admin/actions/ActionWorkspaceBosNeuralPulse";

export const CREATE_LEAD_ASSEMBLY_PHASES = [
    "Reading inquiry",
    "Identifying family",
    "Creating household",
    "Creating lead",
    "Finalizing record",
] as const;

type Props = {
    title: string;
    detail?: string;
    assemblyPhases?: readonly string[];
};

export function ActionWorkspaceExecuteState({
    title,
    detail,
    assemblyPhases = CREATE_LEAD_ASSEMBLY_PHASES,
}: Props) {
    const [phaseIndex, setPhaseIndex] = useState(0);
    const activePhase = assemblyPhases[phaseIndex] ?? assemblyPhases[assemblyPhases.length - 1];
    const progress = ((phaseIndex + 1) / assemblyPhases.length) * 100;

    useEffect(() => {
        if (assemblyPhases.length <= 1) return;
        const timer = window.setInterval(() => {
            setPhaseIndex((prev) => (prev < assemblyPhases.length - 1 ? prev + 1 : prev));
        }, 850);
        return () => window.clearInterval(timer);
    }, [assemblyPhases.length]);

    return (
        <div
            className="flex min-h-[320px] items-center justify-center gap-12 px-4"
            data-testid="action-workspace-execute-state"
        >
            <ActionWorkspaceBosNeuralPulse className="h-36 w-28 shrink-0" activePhaseIndex={phaseIndex} />
            <div className="min-w-0 max-w-lg text-left">
                <p className="text-lg font-semibold text-alloy-midnight">{title}</p>
                {detail ?
                    <p className="mt-1 text-sm text-alloy-midnight/55">{detail}</p>
                :   null}
                <div className="mt-6 space-y-2">
                    {assemblyPhases.map((phase, index) => {
                        const done = index < phaseIndex;
                        const active = index === phaseIndex;
                        return (
                            <div
                                key={phase}
                                className={
                                    active ?
                                        "flex items-center gap-2 text-sm font-medium text-[#007A63]"
                                    : done ?
                                        "flex items-center gap-2 text-sm text-alloy-midnight/45"
                                    :   "flex items-center gap-2 text-sm text-alloy-midnight/30"
                                }
                                data-testid={active ? "action-workspace-execute-phase" : undefined}
                            >
                                <span
                                    className={
                                        active ?
                                            "flex h-5 w-5 items-center justify-center rounded-full bg-[#00A283]/15 text-[10px] text-[#007A63]"
                                        : done ?
                                            "flex h-5 w-5 items-center justify-center rounded-full bg-alloy-pine/10 text-[10px] text-alloy-pine/70"
                                        :   "flex h-5 w-5 items-center justify-center rounded-full bg-alloy-stone/10 text-[10px] text-alloy-midnight/25"
                                    }
                                    aria-hidden
                                >
                                    {done ? "✓" : index + 1}
                                </span>
                                {phase}
                            </div>
                        );
                    })}
                </div>
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-alloy-pine/10">
                    <div
                        className="h-full rounded-full bg-[#00A283] transition-all duration-700 ease-out"
                        style={{ width: `${progress}%` }}
                        data-testid="action-workspace-execute-progress"
                    />
                </div>
            </div>
        </div>
    );
}
