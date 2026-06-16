/**
 * Layout editor shared primitives — reusable base for Person/Child drawer editors (Phase 5.8).
 *
 * Reusable for Person/Child:
 * - layoutEditorDisplayConfig (field display metadata)
 * - layoutEditorVisibilityRules (visibility presets)
 * - layoutEditorInspectModel + layoutEditorRuntimeTraceContext (inspect/trace)
 * - layoutEditorBlockRegistry patterns (extend catalog per surface)
 * - layoutEditorContactRoles (relationship-role cards)
 * - layoutEditorRowTemplateConfig (row template metadata)
 *
 * Still opportunity-specific:
 * - opportunityDrawerLayoutEditorModel / field catalog / surfaceLayoutRegistry gates
 * - OpportunityDrawerLayout* UI components
 * - resolveLeadEnrollmentRowTemplatePresentation / household rendering convergence
 */

export {
    LAYOUT_EDITOR_DISPLAY_METADATA_KEY,
    LAYOUT_LINK_BEHAVIOR_LABELS,
    LAYOUT_LINK_BEHAVIORS,
    type LayoutEditorDisplayConfig,
    type LayoutLinkBehavior,
} from "@/lib/layout/layoutEditorDisplayConfig";

export {
    LAYOUT_EDITOR_VISIBILITY_PRESETS,
    type LayoutEditorVisibilityRule,
} from "@/lib/layout/layoutEditorVisibilityRules";

export {
    buildLayoutEditorInspectInfo,
    buildLayoutEditorItemIdPathIndex,
    type LayoutEditorInspectInfo,
} from "@/lib/layout/layoutEditorInspectModel";

export {
    LAYOUT_EDITOR_BLOCK_TEMPLATE_CATALOG,
    type LayoutEditorBlockTemplate,
    type LayoutEditorBlockTemplateKey,
} from "@/lib/layout/layoutEditorBlockRegistry";
