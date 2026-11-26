import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import { configurationPurposeToStorageTier } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import type { IdentityFieldTier } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";

/** Compose canvas wins over runtime disclosure when actively configuring a nested surface. */
export function shouldRenderIdentityComposeCanvas(args: {
    composing: boolean;
    composeCanvasMode?: "configure" | "preview";
}): boolean {
    return args.composing && args.composeCanvasMode !== "preview";
}

export function identityTierForComposePurpose(
    purpose: Exclude<IdentityConfigurationPurpose, "evidence">,
): IdentityFieldTier {
    return configurationPurposeToStorageTier(purpose);
}
