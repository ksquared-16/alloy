"use client";

import NestedSurfaceFieldLayoutSurface from "@/components/admin/focusPanel/drillIn/NestedSurfaceFieldLayoutSurface";
import { layoutFieldsFromIdentityRecord } from "@/lib/adminV2/runtime/focusPanel/identity/layoutFieldsFromIdentityRecord";
import { identityTierForComposePurpose } from "@/lib/adminV2/runtime/focusPanel/identity/identityComposeMode";
import type { IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

type FieldPurpose = Exclude<IdentityConfigurationPurpose, "evidence">;

type Props = {
    surfaceId: string;
    groupKey: string;
    record: IdentityRecordVM | null;
    purpose: FieldPurpose;
    className?: string;
};

/** Shared in-canvas field layout composer for Summary / Context Facts / Details. */
export default function IdentityComposeSectionCanvas({
    surfaceId,
    groupKey,
    record,
    purpose,
    className,
}: Props) {
    const tier = identityTierForComposePurpose(purpose);
    const fields = record ? layoutFieldsFromIdentityRecord(record, purpose) : [];
    return (
        <NestedSurfaceFieldLayoutSurface
            surfaceId={surfaceId}
            groupKey={groupKey}
            fields={fields}
            tier={tier}
            className={className}
        />
    );
}
