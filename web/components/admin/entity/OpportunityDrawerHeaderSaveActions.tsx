"use client";

import { useCallback, useEffect, useState } from "react";
import DrawerHeaderRecordSaveActions from "@/components/admin/entity/DrawerHeaderRecordSaveActions";
import {
    drawerOperatingIsDirty,
    drawerOperatingRevertAll,
    drawerOperatingSaveAll,
} from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";

/** Opportunity drawer header save — form dirty + inquiry children coordinator; hidden when clean. */
export default function OpportunityDrawerHeaderSaveActions({
    canMutate,
    formDirty,
    onSaveForm,
    onCancelForm,
    formSaving,
    saveSuccess,
    tone,
    onCoordinatorSaveComplete,
}: {
    canMutate: boolean;
    formDirty: boolean;
    onSaveForm: () => void | Promise<void>;
    onCancelForm: () => void;
    formSaving: boolean;
    saveSuccess?: boolean;
    tone?: "default" | "footer";
    onCoordinatorSaveComplete?: () => void;
}) {
    const [coordDirty, setCoordDirty] = useState(false);
    const [coordSaving, setCoordSaving] = useState(false);
    const [coordSaveSuccess, setCoordSaveSuccess] = useState(false);

    const syncCoordDirty = useCallback(() => {
        setCoordDirty(drawerOperatingIsDirty());
    }, []);

    useEffect(() => {
        syncCoordDirty();
        const id = window.setInterval(syncCoordDirty, 400);
        return () => window.clearInterval(id);
    }, [syncCoordDirty]);

    useEffect(() => {
        syncCoordDirty();
    }, [formDirty, syncCoordDirty]);

    const isDirty = formDirty || coordDirty;
    const saving = formSaving || coordSaving;
    const showSaveSuccess = saveSuccess || coordSaveSuccess;

    const onSave = async () => {
        if (formDirty) await onSaveForm();
        if (!drawerOperatingIsDirty()) {
            syncCoordDirty();
            return;
        }
        setCoordSaving(true);
        setCoordSaveSuccess(false);
        try {
            await drawerOperatingSaveAll();
            setCoordSaveSuccess(true);
            onCoordinatorSaveComplete?.();
            window.setTimeout(() => setCoordSaveSuccess(false), 3000);
        } finally {
            setCoordSaving(false);
            syncCoordDirty();
        }
    };

    const onCancel = () => {
        onCancelForm();
        drawerOperatingRevertAll();
        syncCoordDirty();
    };

    return (
        <DrawerHeaderRecordSaveActions
            canMutate={canMutate}
            isDirty={isDirty}
            saving={saving}
            onSave={onSave}
            onCancel={onCancel}
            saveSuccess={showSaveSuccess}
            dirtyDataAttr="opportunity-drawer-dirty"
            saveDataAttr="opportunity-drawer-save-changes"
            revertDataAttr="opportunity-drawer-revert"
            tone={tone}
        />
    );
}
