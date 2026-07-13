/**
 * @deprecated Import from `@/lib/fields/canonicalProviderDedup` — focus_panel re-export shim.
 */

import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import {
    CANONICAL_PICKER_ALIAS_TO_CANONICAL,
    canonicalPickerIdentityForRefKey,
    dedupeCanonicalPickerProviders,
} from "@/lib/fields/canonicalProviderDedup";

export const FOCUS_PANEL_PICKER_ALIAS_TO_CANONICAL = CANONICAL_PICKER_ALIAS_TO_CANONICAL;

export { canonicalPickerIdentityForRefKey };

export function dedupeFocusPanelPickerProviders(
    providers: readonly CanonicalDataProvider[],
): CanonicalDataProvider[] {
    return dedupeCanonicalPickerProviders(providers, "focus_panel");
}
