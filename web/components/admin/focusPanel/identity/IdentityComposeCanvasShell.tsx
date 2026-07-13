"use client";

import IdentityBuilderPurposeNavigation from "@/components/adminV2/settings/surfaces/composer/IdentityBuilderPurposeNavigation";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

type Props = {
    activePurpose: IdentityConfigurationPurpose;
    onSelectPurpose: (purpose: IdentityConfigurationPurpose) => void;
    groupLabel?: string;
    onBack?: () => void;
    composeCanvasMode?: "configure" | "preview";
    surfaceId?: string;
    selectedGroupKey?: string | null;
    children: React.ReactNode;
};

/** Visible compose header + purpose tabs on the in-canvas drill-in surface. */
export default function IdentityComposeCanvasShell({
    activePurpose,
    onSelectPurpose,
    groupLabel,
    onBack,
    composeCanvasMode = "configure",
    surfaceId,
    selectedGroupKey,
    children,
}: Props) {
    return (
        <div
            className="identity-compose-canvas flex min-h-0 flex-col gap-3 space-y-0"
            data-identity-compose-canvas={activePurpose}
            data-compose-canvas-mode={composeCanvasMode}
        >
            {composeCanvasMode === "configure" ? (
                <div className="flex items-center justify-between gap-2 border-b border-alloy-stone/10 pb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">
                        Configure layout
                    </p>
                    <span className="text-[10px] text-alloy-midnight/45">Drag fields · set width · reorder</span>
                </div>
            ) : null}
            {composeCanvasMode === "configure" ? (
                <>
                    {groupLabel ? <p className="config-typo-sublabel">{groupLabel}</p> : null}
                    <IdentityBuilderPurposeNavigation
                        activePurpose={activePurpose}
                        onSelectPurpose={onSelectPurpose}
                        className="sticky top-0 z-[1] bg-white/95 pb-2"
                    />
                </>
            ) : null}
            {children}
        </div>
    );
}
