"use client";

import { useCallback, useMemo, useState } from "react";
import LeadHouseholdPrimaryContactConfirmModal from "@/components/layout/lead/LeadHouseholdPrimaryContactConfirmModal";
import { useLayoutRuntimeHostContext } from "@/components/layout/LayoutRuntimePlanView";
import { MAKE_PRIMARY_CONTACT_ACTION_KEY } from "@/lib/admin/actions/makePrimaryContactAction";
import { patchLeadHouseholdPrimaryContact } from "@/lib/admin/person/patchLeadHouseholdPrimaryContact";
import type { LayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";
import {
    resolveMakePrimaryContactActionContext,
    shouldShowMakePrimaryContactAction,
} from "@/lib/layout/runtime/layoutRuntimeMakePrimaryContactAction";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    anchorRecord: ProofRuntimeRecord;
    rowRecord?: ProofRuntimeRecord;
    layoutContactRole?: LayoutEditorContactRole | null;
    label?: string;
    canMutate?: boolean;
    className?: string;
    testId?: string;
};

/** EB runtime action button — promote a linked contact to household primary (confirmation required). */
export default function LayoutRuntimeMakePrimaryContactActionButton({
    anchorRecord,
    rowRecord,
    layoutContactRole,
    label = "Make Primary Contact",
    canMutate: canMutateProp,
    className,
    testId,
}: Props) {
    const host = useLayoutRuntimeHostContext();
    const canMutate = canMutateProp ?? host.canMutate ?? false;

    const context = useMemo(
        () =>
            resolveMakePrimaryContactActionContext({
                anchorRecord,
                rowRecord,
                layoutContactRole,
                opportunityId: host.entityId,
            }),
        [anchorRecord, rowRecord, layoutContactRole, host.entityId],
    );

    const visible = shouldShowMakePrimaryContactAction({ context, canMutate });
    const [pending, setPending] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const openConfirm = useCallback(() => {
        if (!visible || !context) return;
        setError(null);
        setPending(true);
    }, [visible, context]);

    const handleConfirm = useCallback(async () => {
        if (!context) return;
        setSaving(true);
        setError(null);
        try {
            await patchLeadHouseholdPrimaryContact({
                customerId: context.customerId,
                personId: context.targetPersonId,
                opportunityId: context.opportunityId,
                opportunityRecord: anchorRecord,
            });
            setPending(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update primary contact");
        } finally {
            setSaving(false);
        }
    }, [anchorRecord, context]);

    if (!visible || !context) return null;

    return (
        <>
            <button
                type="button"
                className={
                    className
                    ?? "inline-flex rounded border border-alloy-forge/20 bg-white px-2 py-0.5 text-xs font-medium text-alloy-pine hover:border-alloy-pine/30"
                }
                data-testid={testId ?? `layout-runtime-action-button-${MAKE_PRIMARY_CONTACT_ACTION_KEY}`}
                data-layout-runtime-action-key={MAKE_PRIMARY_CONTACT_ACTION_KEY}
                onClick={openConfirm}
            >
                {label}
            </button>
            {error ?
                <p className="mt-1 text-[10px] text-alloy-ember" data-layout-runtime-make-primary-error="true">
                    {error}
                </p>
            :   null}
            <LeadHouseholdPrimaryContactConfirmModal
                isOpen={pending}
                personName={context.targetPersonName}
                currentPrimaryName={context.currentPrimaryPersonName}
                scopeLabels={context.scopeLabels}
                isLoading={saving}
                onClose={() => {
                    if (saving) return;
                    setPending(false);
                }}
                onConfirm={handleConfirm}
            />
        </>
    );
}
