"use client";

import { BosExecutionLoader, BOS_EXECUTION_LOADER_PHASES_DRAWER_PREP } from "@/components/admin/actions/BosExecutionLoader";
import type { ComposedDrawerPreparingCopy } from "@/lib/admin/drawer/composedDrawerPayload";

/** Premium centered preparing state — intentional hold until composed payload is ready. */
export default function DrawerComposedPreparingState({
    copy,
    dataTestId,
}: {
    copy: ComposedDrawerPreparingCopy;
    dataTestId?: string;
}) {
    return (
        <div
            className="flex min-h-[min(100%,26rem)] w-full flex-col items-center justify-center rounded-xl border border-alloy-stone/12 bg-gradient-to-b from-alloy-stone/[0.07] via-white to-alloy-stone/[0.04] px-5 py-10"
            role="status"
            aria-live="polite"
            aria-busy="true"
            data-drawer-composed-preparing="true"
            data-testid={dataTestId}
        >
            <div className="w-full max-w-md rounded-xl border border-alloy-stone/12 bg-white px-5 py-6 shadow-md">
                <BosExecutionLoader
                    variant="drawer"
                    title={copy.title}
                    subtitle={copy.description}
                    steps={BOS_EXECUTION_LOADER_PHASES_DRAWER_PREP}
                    showProgress
                    data-testid="drawer-composed-preparing-loader"
                />
            </div>
        </div>
    );
}
