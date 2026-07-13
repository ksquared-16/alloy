"use client";

import IdentityComposeSectionCanvas from "@/components/admin/focusPanel/identity/IdentityComposeSectionCanvas";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

type Props = {
    surfaceId: string;
    groupKey: string;
    config: NestedSurfaceConfig;
    onChange: (next: NestedSurfaceConfig) => void;
    onOpenLibrary?: () => void;
    onSelectField?: (fieldKey: string) => void;
    className?: string;
};

/**
 * Compatibility alias — Context uses the canonical green visual composer.
 * Inheritance UX and the flat white field editor are intentionally removed.
 */
export default function IdentityContextFactsPanel({
    surfaceId,
    groupKey,
    className,
}: Props) {
    return (
        <div className={className} data-identity-context-facts-panel="true" data-identity-canonical-composer="true">
            <IdentityComposeSectionCanvas
                surfaceId={surfaceId}
                groupKey={groupKey}
                record={null}
                purpose="context_facts"
            />
        </div>
    );
}
