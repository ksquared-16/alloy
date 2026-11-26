"use client";

import clsx from "clsx";
import IdentityBuilderPurposeNavigation, {
    IDENTITY_BUILDER_PURPOSE_LABELS,
} from "@/components/adminV2/settings/surfaces/composer/IdentityBuilderPurposeNavigation";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

const PURPOSE_STEPS: Exclude<IdentityConfigurationPurpose, "evidence">[] = [
    "summary",
    "context_facts",
    "details",
];

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
                        {IDENTITY_BUILDER_PURPOSE_LABELS[activePurpose]}
                    </p>
                </div>
                {onBack ?
                    <button type="button" className="text-[11px] font-medium text-alloy-pine hover:underline" onClick={onBack}>
                        ← Back
                    </button>
                :   null}
            </div>
            <IdentityBuilderPurposeNavigation
                activePurpose={activePurpose}
                onSelectPurpose={onSelectPurpose}
            />
            {nextPurpose && activePurpose !== "evidence" ?
                <button
                    type="button"
                    className="mt-3 text-[11px] font-medium text-alloy-pine hover:underline"
                    onClick={() => onSelectPurpose(nextPurpose)}
                >
                    Configure {IDENTITY_BUILDER_PURPOSE_LABELS[nextPurpose]} →
                </button>
            :   null}
        </div>
    );
}
