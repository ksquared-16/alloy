"use client";

import { useCallback, useMemo, useState } from "react";
import RelationshipActionGuidedModal from "@/components/layout/RelationshipActionGuidedModal";
import LayoutRuntimeMakePrimaryContactActionButton from "@/components/layout/LayoutRuntimeMakePrimaryContactActionButton";
import { useLayoutRuntimeHostContext } from "@/components/layout/LayoutRuntimePlanView";
import { isMakePrimaryContactActionKey } from "@/lib/admin/actions/makePrimaryContactAction";
import type { RelationshipActionKey } from "@/lib/admin/relationship/relationshipActionContract";
import { relationshipActionRegistryEntry } from "@/lib/admin/relationship/relationshipActionRegistry";
import {
    resolveRelationshipActionContext,
    shouldShowRelationshipAction,
} from "@/lib/admin/relationship/relationshipActionRuntimeContext";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { LayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";

type Props = {
    actionKey: RelationshipActionKey;
    anchorRecord: ProofRuntimeRecord;
    rowRecord?: ProofRuntimeRecord;
    layoutContactRole?: LayoutEditorContactRole | null;
    label?: string;
    canMutate?: boolean;
    className?: string;
    testId?: string;
};

/** Unified layout runtime relationship action button — registry-driven wizard or external executor. */
export default function LayoutRuntimeRelationshipActionButton({
    actionKey,
    anchorRecord,
    rowRecord,
    layoutContactRole,
    label,
    canMutate: canMutateProp,
    className,
    testId,
}: Props) {
    const entry = relationshipActionRegistryEntry(actionKey);
    const host = useLayoutRuntimeHostContext();
    const canMutate = canMutateProp ?? host.canMutate ?? false;

    const sourceSurface =
        host.anchorEntity === "child" ? "child_drawer"
        : host.anchorEntity === "person" ? "person_drawer"
        : "opportunity_drawer";

    const context = useMemo(
        () => resolveRelationshipActionContext({ anchorRecord, sourceSurface }),
        [anchorRecord, sourceSurface],
    );

    const visible = shouldShowRelationshipAction({ context, canMutate });
    const [open, setOpen] = useState(false);

    const openWizard = useCallback(() => {
        if (!visible || !context || entry?.externalExecutor) return;
        setOpen(true);
    }, [visible, context, entry?.externalExecutor]);

    if (entry?.externalExecutor && isMakePrimaryContactActionKey(actionKey)) {
        return (
            <LayoutRuntimeMakePrimaryContactActionButton
                anchorRecord={anchorRecord}
                rowRecord={rowRecord}
                layoutContactRole={layoutContactRole}
                label={label ?? entry.label}
                canMutate={canMutate}
                className={className}
                testId={testId}
            />
        );
    }

    if (!visible || !context || !entry) return null;

    return (
        <>
            <button
                type="button"
                className={
                    className
                    ?? "inline-flex rounded border border-alloy-forge/20 bg-white px-2 py-0.5 text-xs font-medium text-alloy-pine hover:border-alloy-pine/30"
                }
                data-testid={testId ?? `layout-runtime-action-button-${actionKey}`}
                data-layout-runtime-action-key={actionKey}
                onClick={openWizard}
            >
                {label ?? entry.label}
            </button>
            <RelationshipActionGuidedModal
                open={open}
                actionKey={actionKey}
                context={context}
                anchorRecord={anchorRecord}
                onClose={() => setOpen(false)}
            />
        </>
    );
}
