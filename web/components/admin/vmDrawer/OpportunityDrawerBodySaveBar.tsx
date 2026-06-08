"use client";

import { useCallback, useEffect, useState } from "react";
import { ADMINV2_SHELL_COMMAND_INSET } from "@/components/admin/Drawer";
import OpportunityDrawerHeaderSaveActions from "@/components/admin/entity/OpportunityDrawerHeaderSaveActions";
import { drawerOperatingIsDirty } from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";

type Props = {
    canMutate: boolean;
};

/**
 * Floating save rail — bottom-right inside drawer chrome, above BOS command bar.
 * Absolute within drawer body so it never shifts scroll content.
 */
export default function OpportunityDrawerBodySaveBar({ canMutate }: Props) {
    const [coordDirty, setCoordDirty] = useState(false);

    const syncDirty = useCallback(() => {
        setCoordDirty(drawerOperatingIsDirty());
    }, []);

    useEffect(() => {
        syncDirty();
        const id = window.setInterval(syncDirty, 400);
        return () => window.clearInterval(id);
    }, [syncDirty]);

    if (!canMutate || !coordDirty) return null;

    return (
        <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[25] flex justify-end px-3 pb-3"
            style={{ paddingBottom: `calc(${ADMINV2_SHELL_COMMAND_INSET} + 0.5rem)` }}
            data-opportunity-drawer-body-save-bar="true"
        >
            <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-md border border-alloy-stone/15 bg-white/98 px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.28)] backdrop-blur-[2px]">
                <OpportunityDrawerHeaderSaveActions
                    canMutate={canMutate}
                    formDirty={false}
                    onSaveForm={() => undefined}
                    onCancelForm={() => undefined}
                    formSaving={false}
                />
            </div>
        </div>
    );
}
