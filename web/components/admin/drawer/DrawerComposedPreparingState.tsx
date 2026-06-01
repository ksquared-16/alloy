"use client";

import { AdminV2DrawerLoadingState } from "@/components/admin/workspace/AdminV2DrawerLoadingState";
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
            <AdminV2DrawerLoadingState
                title={copy.title}
                description={copy.description}
                density="panel"
                tone="record"
                className="w-full max-w-md shadow-md"
            />
        </div>
    );
}
