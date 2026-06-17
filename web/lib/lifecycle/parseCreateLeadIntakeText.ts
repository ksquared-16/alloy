/**
 * Create Lead paste parser — thin adapter over the shared intake engine.
 * Re-exports preserve existing import paths.
 */
export {
    parseCreateLeadIntakeText,
    createLeadIntakePasteParser,
} from "@/lib/intake/adapt/parseCreateLeadIntakeText";
