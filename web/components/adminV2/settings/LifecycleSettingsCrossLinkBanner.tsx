import Link from "next/link";
import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

export type LifecycleSettingsCrossLinkVariant = "layouts" | "actions" | "statuses" | "attention";

const COPY: Record<
    LifecycleSettingsCrossLinkVariant,
    { body: string; testId: string }
> = {
    layouts: {
        body: "Lifecycle requirements control what information is needed to progress. Drawer layouts control how that information appears.",
        testId: "lifecycle-crosslink-layouts",
    },
    actions: {
        body: "Action visibility determines where buttons appear. Lifecycle requirements determine whether progression actions can run.",
        testId: "lifecycle-crosslink-actions",
    },
    statuses: {
        body: "Statuses should map to enrollment lifecycle stages.",
        testId: "lifecycle-crosslink-statuses",
    },
    attention: {
        body: "Needs-attention rules can be based on missing lifecycle information.",
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
                    Open Lifecycle
                </Link>
            </p>
        </div>
    );
}
