/**
 * Standard titles and helper copy for Forms/Documents progressive disclosure regions.
 */

export const FORMS_TECHNICAL_DISCLOSURE = {
    technicalDetails: {
        title: "Technical details",
        helper: "Identifiers, raw payloads, and session metadata for support — not required for routine review.",
    },
    reviewDiagnostics: {
        title: "Review diagnostics",
        helper: "Launch routing, link configuration, and intake mechanics — expand when troubleshooting capture or prefill.",
    },
    linkageDetails: {
        title: "Linkage details",
        helper: "CRM record identifiers for manual verification — use Open on linked records above when possible.",
    },
    setupHelp: {
        title: "Setup help",
        helper: "Environment seeding and engineering notes — optional for operators provisioning forms.",
    },
} as const;

export type FormsTechnicalDisclosureKey = keyof typeof FORMS_TECHNICAL_DISCLOSURE;
