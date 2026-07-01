import Link from "next/link";
import { BUSINESS_PROCESS_CROSS_LINK_OPEN } from "@/lib/lifecycle/businessProcessUiLabels";
import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

export type LifecycleSettingsCrossLinkVariant = "layouts" | "actions" | "statuses" | "attention";

const COPY: Record<
    LifecycleSettingsCrossLinkVariant,
    { body: string; testId: string }
> = {
    layouts: {
        body: "Business process requirements control what information is needed to progress. Drawer layouts control how that information appears.",
        testId: "lifecycle-crosslink-layouts",
    },
    actions: {
        body: "Action visibility determines where buttons appear. Process requirements determine whether progression actions can run.",
        testId: "lifecycle-crosslink-actions",
    },
    statuses: {
        body: "Process stages group statuses into the enrollment pipeline. Assign each inquiry status to a stage so queues and actions stay aligned.",
        testId: "lifecycle-crosslink-statuses",
    },
    attention: {
        body: "Needs-attention rules can be based on missing process information or overdue expected work.",
        testId: "lifecycle-crosslink-attention",
    },
};

export default function LifecycleSettingsCrossLinkBanner({
    variant,
}: {
    variant: LifecycleSettingsCrossLinkVariant;
}) {
    const { body, testId } = COPY[variant];
    return (
        <div
            className="rounded-xl border border-alloy-pine/20 bg-alloy-pine/[0.05] px-4 py-3 text-sm text-alloy-midnight/80"
            data-testid={testId}
        >
            <p className="text-xs leading-relaxed">{body}</p>
            <p className="mt-2">
                <Link
                    href={ADMIN_V2_SETTINGS_LIFECYCLE_PATH}
                    className="text-xs font-medium text-alloy-pine hover:underline"
                >
                    {BUSINESS_PROCESS_CROSS_LINK_OPEN}
                </Link>
            </p>
        </div>
    );
}
