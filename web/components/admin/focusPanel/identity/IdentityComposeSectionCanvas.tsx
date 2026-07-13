"use client";

import { useEffect } from "react";

import NestedSurfaceFieldLayoutSurface from "@/components/admin/focusPanel/drillIn/NestedSurfaceFieldLayoutSurface";
import { layoutFieldsFromIdentityRecord } from "@/lib/adminV2/runtime/focusPanel/identity/layoutFieldsFromIdentityRecord";
import { identityTierForComposePurpose } from "@/lib/adminV2/runtime/focusPanel/identity/identityComposeMode";
import type { IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

type FieldPurpose = Exclude<IdentityConfigurationPurpose, "evidence">;

type Props = {
    surfaceId: string;
    groupKey: string;
    record: IdentityRecordVM | null;
    purpose: FieldPurpose;
    className?: string;
};

/** Canonical green visual field composer for Summary / Context / Details. */
export default function IdentityComposeSectionCanvas({
    surfaceId,
    groupKey,
    record,
    purpose,
    className,
}: Props) {
    const composer = useFocusPanelComposer();
    const tier = identityTierForComposePurpose(purpose);
    const fields = record ? layoutFieldsFromIdentityRecord(record, purpose) : [];

    useEffect(() => {
        if (!composer?.isComposingSurface(surfaceId)) return;
        composer.select({ kind: "region", surfaceId, groupKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [surfaceId, groupKey, purpose]);

    return (
        <div data-identity-canonical-composer="true" data-identity-compose-purpose={purpose}>
            <NestedSurfaceFieldLayoutSurface
                surfaceId={surfaceId}
                groupKey={groupKey}
                fields={fields}
                tier={tier}
                showAddField
                className={className}
            />
        </div>
    );
}
