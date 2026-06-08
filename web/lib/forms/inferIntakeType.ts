/**
 * Intake type inference from link metadata + form key.
 * Shared by orchestration presentation and operational intent templates.
 */

import { parseIntakeAutoCreateFlags } from "@/lib/forms/intake/parseIntakeAutoCreateFlags";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";
import { ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY } from "@/lib/forms/seeds/enrollmentLeadCaptureDemo";
import { MEDICATION_AUTHORIZATION_DEMO_FORM_KEY } from "@/lib/forms/seeds/medicationAuthorizationDemo";

export type IntakeTypeKey =
    | "enrollment_lead"
    | "existing_family"
    | "waitlist"
    | "operational_document"
    | "packet_step"
    | "general";

function metaObject(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}

export function inferIntakeTypeFromLink(
    linkMetadata: Record<string, unknown> | null | undefined,
    formKey: string
): IntakeTypeKey {
    const meta = metaObject(linkMetadata);
    if (meta.form_context_mode === "existing_record") return "existing_family";
    if (meta.mode === "packet" || meta.packet_session_id) return "packet_step";
    if (formKey === ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY) return "enrollment_lead";
    if (formKey === MEDICATION_AUTHORIZATION_DEMO_FORM_KEY) return "operational_document";
    if (meta.intake_purpose === "enrollment_lead") return "enrollment_lead";
    const flags = parseIntakeAutoCreateFlags(meta);
    if (flags.auto_create_opportunity && linkRequiresLeadCapture(meta)) return "enrollment_lead";
    if (linkRequiresLeadCapture(meta)) return "waitlist";
    return "general";
}

export const INTAKE_TYPE_CATALOG: Record<
    IntakeTypeKey,
    { label: string; description: string }
> = {
    enrollment_lead: {
        label: "Enrollment lead",
        description: "Creates a lead/opportunity when families submit — routes to your enrollment pipeline.",
    },
    existing_family: {
        label: "Existing family update",
        description: "Attaches to a known family or record — evidence and updates, not a new lead.",
    },
    waitlist: {
        label: "Waitlist intake",
        description: "Captures interest and queues families — may create or attach opportunities.",
    },
    operational_document: {
        label: "Operational document",
        description: "Collects signed or operational evidence — review may be required before CRM routing.",
    },
    packet_step: {
        label: "Packet step",
        description: "One step in a multi-form packet — operationalizes when the packet completes.",
    },
    general: {
        label: "General intake",
        description: "Form submissions saved — configure intake on the distribution link for CRM routing.",
    },
};
