"use client";

import { useCallback, useEffect, useState } from "react";
import DrawerHeaderRecordSaveActions from "@/components/admin/entity/DrawerHeaderRecordSaveActions";
import {
    personDrawerOperatingIsDirty,
    personDrawerOperatingRevertAll,
    personDrawerOperatingSaveAll,
} from "@/lib/admin/person/personDrawerEditingCoordinator";
import { setPersonDrawerUnsavedChecker } from "@/lib/admin/person/personDrawerUnsavedGuard";

/** Person drawer operating save/cancel — header record actions; visible only when dirty. */
export default function PersonDrawerOperatingSaveHeaderActions({ canMutate }: { canMutate: boolean }) {
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);

    const syncDirty = useCallback(() => {
        setDirty(personDrawerOperatingIsDirty());
    }, []);

    useEffect(() => {
        syncDirty();
        const id = window.setInterval(syncDirty, 400);
        return () => window.clearInterval(id);
    }, [syncDirty]);

    useEffect(() => {
        setPersonDrawerUnsavedChecker(() => personDrawerOperatingIsDirty());
        return () => setPersonDrawerUnsavedChecker(null);
    }, []);

    return (
        <DrawerHeaderRecordSaveActions
            canMutate={canMutate}
            isDirty={dirty}
            saving={saving}
            onSave={async () => {
                setSaving(true);
                try {
                    await personDrawerOperatingSaveAll();
                    syncDirty();
                } finally {
                    setSaving(false);
                }
            }}
            onCancel={() => {
                personDrawerOperatingRevertAll();
                syncDirty();
            }}
            dirtyDataAttr="person-drawer-dirty"
            saveDataAttr="person-drawer-save-changes"
            revertDataAttr="person-drawer-revert"
        />
    );
}
