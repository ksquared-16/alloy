"use client";

import type { StageWorkCompletionPolicyV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { completionPolicySummary, normalizeCompletionPolicy } from "@/lib/lifecycle/stageWorkCompletionPolicy";

type Props = {
    policy: StageWorkCompletionPolicyV1 | undefined;
    onChange: (policy: StageWorkCompletionPolicyV1 | undefined) => void;
    testIdPrefix: string;
};

function readPolicy(policy: StageWorkCompletionPolicyV1 | undefined) {
    return normalizeCompletionPolicy(policy) ?? {};
}

export default function LifecycleStageWorkCompletionPolicyEditor({ policy, onChange, testIdPrefix }: Props) {
    const current = readPolicy(policy);
    const enabled = Boolean(current.min_attempts || current.max_attempts || current.window_days || current.repeat_until_outcome);

    const update = (patch: Partial<StageWorkCompletionPolicyV1>) => {
        const next = normalizeCompletionPolicy({ ...current, ...patch });
        onChange(next);
    };

    const summary = completionPolicySummary(current);

    return (
        <div className="mt-3 rounded-md border border-alloy-forge/10 bg-white p-2.5" data-testid={`${testIdPrefix}-completion-policy`}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[0.6875rem] font-semibold text-alloy-midnight/70">Completion policy</span>
                <label className="flex items-center gap-1 text-[0.6875rem] text-alloy-midnight/65">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => {
                            if (!e.target.checked) {
                                // Clear the ATTEMPT fields only. `sufficient_command_results` lives
                                // on the same policy but has no control in this editor, so dropping
                                // the whole policy silently destroyed configuration the operator
                                // could not see and had no way to restore.
                                onChange(
                                    normalizeCompletionPolicy({
                                        sufficient_command_results: current.sufficient_command_results,
                                    }),
                                );
                                return;
                            }
                            update({
                                min_attempts: 1,
                                max_attempts: 1,
                                window_days: 7,
                                repeat_until_outcome: false,
                            });
                        }}
                        data-testid={`${testIdPrefix}-completion-policy-enabled`}
                    />
                    Require multiple attempts
                </label>
            </div>

            {enabled ?
                <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-1 text-[0.6875rem] text-alloy-midnight/65">
                        Min attempts
                        <input
                            type="number"
                            min={1}
                            className="w-14 rounded-md border border-alloy-forge/15 px-1 py-0.5"
                            value={current.min_attempts ?? 1}
                            onChange={(e) => update({ min_attempts: Math.max(1, Number(e.target.value) || 1) })}
                            data-testid={`${testIdPrefix}-completion-policy-min`}
                        />
                    </label>
                    <label className="flex items-center gap-1 text-[0.6875rem] text-alloy-midnight/65">
                        Max attempts
                        <input
                            type="number"
                            min={1}
                            className="w-14 rounded-md border border-alloy-forge/15 px-1 py-0.5"
                            value={current.max_attempts ?? current.min_attempts ?? 1}
                            onChange={(e) => update({ max_attempts: Math.max(1, Number(e.target.value) || 1) })}
                            data-testid={`${testIdPrefix}-completion-policy-max`}
                        />
                    </label>
                    <label className="flex items-center gap-1 text-[0.6875rem] text-alloy-midnight/65">
                        Complete within
                        <input
                            type="number"
                            min={1}
                            className="w-14 rounded-md border border-alloy-forge/15 px-1 py-0.5"
                            value={current.window_days ?? 7}
                            onChange={(e) => update({ window_days: Math.max(1, Number(e.target.value) || 1) })}
                            data-testid={`${testIdPrefix}-completion-policy-window`}
                        />
                        days
                    </label>
                    <label className="flex items-center gap-1 text-[0.6875rem] text-alloy-midnight/65">
                        <input
                            type="checkbox"
                            checked={Boolean(current.repeat_until_outcome)}
                            onChange={(e) =>
                                update({
                                    repeat_until_outcome: e.target.checked,
                                    repeat_due_days: current.repeat_due_days ?? 2,
                                })
                            }
                            data-testid={`${testIdPrefix}-completion-policy-repeat`}
                        />
                        Repeat after incomplete outcomes
                    </label>
                    {current.repeat_until_outcome ?
                        <label className="flex items-center gap-1 text-[0.6875rem] text-alloy-midnight/65 sm:col-span-2">
                            Repeat due in
                            <input
                                type="number"
                                min={1}
                                className="w-14 rounded-md border border-alloy-forge/15 px-1 py-0.5"
                                value={current.repeat_due_days ?? 2}
                                onChange={(e) =>
                                    update({ repeat_due_days: Math.max(1, Number(e.target.value) || 1) })
                                }
                                data-testid={`${testIdPrefix}-completion-policy-repeat-due`}
                            />
                            days
                        </label>
                    :   null}
                </div>
            :   null}

            {summary ?
                <p className="mt-2 text-[0.6875rem] text-alloy-midnight/55" data-testid={`${testIdPrefix}-completion-policy-summary`}>
                    {summary}
                </p>
            :   null}
        </div>
    );
}
