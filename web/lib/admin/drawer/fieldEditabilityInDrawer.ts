/**
 * Drawer field-policy chrome TYPE only.
 *
 * The former builders (`buildDrawerFieldPolicyChromeFromEntityData`, `buildFieldLabelMapFromEntityData`,
 * `applyPolicyChromeToOverviewSections`) were RETIRED (P4): they had no production caller — the inline
 * Work Unit Focus Panel resolves editability from published `NestedSurfaceConfig` via
 * `resolveIdentityFieldPolicy` (config-driven), and `EntityDrawerOverview`'s `fieldPolicyChromeByKey` prop
 * is never populated. Only this shape survives, as the (unpopulated) prop type on that legacy modal-drawer
 * component. Field editability is owned by the published field/interaction policy, not by drawer chrome.
 */

export type DrawerFieldPolicyChrome = {
    /** Show required asterisk on label. */
    showRequired: boolean;
    /** Policy marks field read-only in drawer (display + block edit). */
    readOnly: boolean;
    /** When set, inline edit routes to linked record PATCH (V1: primary person). */
    linkedSourceLabel?: string | null;
    readOnlyReason?: string | null;
};
