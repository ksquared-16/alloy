"use client";

import clsx from "clsx";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

const PURPOSE_STEPS: Exclude<IdentityConfigurationPurpose, "evidence">[] = [
    "summary",
    "context_facts",
    "details",
];

const PURPOSE_LABELS: Record<IdentityConfigurationPurpose, string> = {
    summary: "Summary Fields",
    context_facts: "Context Facts",
    details: "Detail Fields",
    evidence: "Evidence Collections",
};

type Props = {
    activePurpose: IdentityConfigurationPurpose;
    onSelectPurpose: (purpose: IdentityConfigurationPurpose) => void;
    onBack?: () => void;
    groupLabel?: string;
    className?: string;
};

/** Progressive builder drill — one configuration purpose at a time. */
export default function IdentityBuilderDrillIn({
    activePurpose,
    onSelectPurpose,
    onBack,
    groupLabel,
    className,
}: Props) {
    const stepIndex = PURPOSE_STEPS.indexOf(activePurpose as Exclude<IdentityConfigurationPurpose, "evidence">);
    const nextPurpose =
        stepIndex >= 0 && stepIndex < PURPOSE_STEPS.length - 1 ? PURPOSE_STEPS[stepIndex + 1] : null;
    const prevPurpose = stepIndex > 0 ? PURPOSE_STEPS[stepIndex - 1] : null;

    return (
        <div className={clsx("identity-builder-drill", className)} data-identity-builder-drill={activePurpose}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                    {groupLabel ?
                        <p className="config-typo-sublabel">{groupLabel}</p>
                    :   null}
                    <p className="text-sm font-semibold text-alloy-midnight">
                        {PURPOSE_LABELS[activePurpose]}
                    </p>
                </div>
                {onBack ?
                    <button type="button" className="text-[11px] font-medium text-alloy-pine hover:underline" onClick={onBack}>
                        ← Back
                    </button>
                :   null}
            </div>
            <div className="flex flex-wrap gap-1">
                {PURPOSE_STEPS.map((purpose) => (
                    <button
                        key={purpose}
                        type="button"
                        className={clsx(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            activePurpose === purpose
                                ? "bg-alloy-pine/15 text-alloy-pine"
                                : "bg-alloy-stone/10 text-alloy-midnight/45",
                        )}
                        aria-current={activePurpose === purpose ? "step" : undefined}
                        onClick={() => onSelectPurpose(purpose)}
                    >
                        {PURPOSE_LABELS[purpose]}
                    </button>
                ))}
                <button
                    type="button"
                    className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        activePurpose === "evidence"
                            ? "bg-alloy-pine/15 text-alloy-pine"
                            : "bg-alloy-stone/10 text-alloy-midnight/45",
                    )}
                    aria-current={activePurpose === "evidence" ? "step" : undefined}
                    onClick={() => onSelectPurpose("evidence")}
                >
                    {PURPOSE_LABELS.evidence}
                </button>
            </div>
            {nextPurpose && activePurpose !== "evidence" ?
                <button
                    type="button"
                    className="mt-3 text-[11px] font-medium text-alloy-pine hover:underline"
                    onClick={() => onSelectPurpose(nextPurpose)}
                >
                    Configure {PURPOSE_LABELS[nextPurpose]} →
                </button>
            :   null}
        </div>
    );
}
