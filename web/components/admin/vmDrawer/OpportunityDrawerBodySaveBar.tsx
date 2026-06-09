"use client";

import { useCallback, useEffect, useState } from "react";
import OpportunityDrawerHeaderSaveActions from "@/components/admin/entity/OpportunityDrawerHeaderSaveActions";
import { drawerOperatingIsDirty } from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";

type Props = {
    canMutate: boolean;
};

/**
 * Drawer footer action stripe — embedded bottom chrome, dirty-only, actions right-aligned.
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
            className="flex w-full items-center justify-end gap-2 border-t border-alloy-midnight/[0.08] bg-gradient-to-b from-white to-alloy-stone/50 px-4 py-2 sm:px-5"
            data-opportunity-drawer-body-save-bar="true"
        >
            <OpportunityDrawerHeaderSaveActions
                canMutate={canMutate}
                formDirty={false}
                onSaveForm={() => undefined}
                onCancelForm={() => undefined}
                formSaving={false}
                tone="footer"
            />
        </div>
    );
}
