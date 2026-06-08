import Link from "next/link";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { lifecycleStageWorkspaceAppearance } from "@/lib/completion/lifecycleStageWorkspaceMapping";

const WORK_UNITS_SETTINGS_PATH = "/adminV2/settings/work-units";

export default function LifecycleStageWhereAppears({ stage }: { stage: LifecycleOperatorStage }) {
    const appearance = lifecycleStageWorkspaceAppearance(stage);

    return (
        <section
            className="mt-6 rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.03] p-4"
            data-testid="lifecycle-stage-where-appears"
        >
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                Where This Stage Appears
            </h3>

            {!appearance.mapped ? (
                <p className="mt-2 text-sm text-alloy-midnight/70">
                    Not mapped to a Work Unit yet.{" "}
                    <Link href={WORK_UNITS_SETTINGS_PATH} className="font-medium text-alloy-pine hover:underline">
                        Work Units &amp; Queues
                    </Link>
                </p>
            ) : (
                <dl className="mt-3 grid gap-3 text-sm text-alloy-midnight/85 sm:grid-cols-2">
                    <div>
                        <dt className="text-xs font-medium text-alloy-midnight/50">Work Unit / Queue</dt>
                        <dd className="mt-1" data-testid="lifecycle-stage-work-unit-queues">
                            <span className="font-medium">{appearance.workUnitName}</span>
                            <ul className="mt-1 list-inside list-disc text-xs text-alloy-midnight/70">
                                {appearance.queues.map((q) => (
                                    <li key={q.label}>
                                        {q.label}
                                        {q.description ? (
                                            <span className="text-alloy-midnight/50"> — {q.description}</span>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs font-medium text-alloy-midnight/50">Statuses</dt>
                        <dd className="mt-1 flex flex-wrap gap-1.5" data-testid="lifecycle-stage-statuses">
                            {appearance.statusLabels.map((s) => (
                                <span
                                    key={s}
                                    className="rounded-md border border-alloy-forge/12 bg-white/80 px-2 py-0.5 text-xs"
                                >
                                    {s}
                                </span>
                            ))}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs font-medium text-alloy-midnight/50">Primary Actions</dt>
                        <dd className="mt-1 flex flex-wrap gap-1.5" data-testid="lifecycle-stage-primary-actions">
                            {appearance.actions.map((a) => (
                                <span
                                    key={a}
                                    className="rounded-md border border-alloy-forge/12 bg-white/80 px-2 py-0.5 text-xs"
                                >
                                    {a}
                                </span>
                            ))}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs font-medium text-alloy-midnight/50">Needs Attention Signals</dt>
                        <dd className="mt-1" data-testid="lifecycle-stage-needs-attention">
                            {appearance.needsAttentionSignals.length ? (
                                <ul className="list-inside list-disc text-xs text-alloy-midnight/70">
                                    {appearance.needsAttentionSignals.map((s) => (
                                        <li key={s}>{s}</li>
                                    ))}
                                </ul>
                            ) : (
                                <span className="text-xs text-alloy-midnight/50">None specific to this stage</span>
                            )}
                            <p className="mt-1 text-[11px] text-alloy-midnight/45">
                                Configure thresholds in{" "}
                                <Link
                                    href="/adminV2/settings/attention-sla-rules"
                                    className="font-medium text-alloy-pine hover:underline"
                                >
                                    Attention &amp; SLA
                                </Link>
                            </p>
                        </dd>
                    </div>
                </dl>
            )}
        </section>
    );
}
