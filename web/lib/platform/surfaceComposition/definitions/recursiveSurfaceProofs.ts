/**
 * Recursive-surface proofs (Experience Builder V3, Parts 3 & 5).
 *
 * Two surfaces that prove the keystone — "Expanded is another Surface" — on two
 * DIFFERENT axes, so no one can say "that's just another drawer":
 *
 *   1. Children Surface        — Record → Record Surface (recursion: a child row
 *                                 opens the Children Surface for that child).
 *   2. Financial Config Surface — Operational Surface → Operational Surface
 *                                 (Configuration → History → Actions).
 *
 * Both are composed from the SAME `universalSurfaceModel` — one engine, different
 * component types. The Focus Panel surface's components declare the `openSurfaceId`
 * bindings that link into them.
 *
 * @see docs/platform/operator/experience-builder-v3-universal-surface-composition.md §3.2
 */

import type { SurfaceSpec } from "@/lib/platform/surfaceComposition/universalSurfaceModel";

export const HOUSEHOLD_SURFACE_ID = "household_surface";
export const CHILDREN_SURFACE_ID = "children_surface";
export const FINANCIAL_CONFIG_SURFACE_ID = "financial_configuration_surface";
export const FOCUS_PANEL_SURFACE_ID = "focus_panel_surface";

// ── 0. Household Surface (Record → Household drill-in) ───────────────────────────

export const householdSurface: SurfaceSpec = {
    id: HOUSEHOLD_SURFACE_ID,
    label: "Household",
    category: "focus_panel",
    grain: "case",
    version: 1,
    canvas: {
        rows: [
            {
                id: "row-household",
                components: [
                    {
                        id: "household_component",
                        label: "Household",
                        componentType: "card",
                        width: "full",
                        evidenceGroups: [
                            {
                                key: "primary_contact",
                                label: "Primary Contact",
                                purpose: "Who is the primary household contact?",
                                owner: "household_component",
                                items: [
                                    { key: "person.primary_contact_name", label: "Name", kind: "field", namespace: "person" },
                                    { key: "person.phone", label: "Phone", kind: "field", namespace: "person" },
                                    { key: "person.email", label: "Email", kind: "field", namespace: "person" },
                                    { key: "person.date_of_birth", label: "Date of Birth", kind: "field", namespace: "person" },
                                    { key: "person.address_line", label: "Address", kind: "field", namespace: "person" },
                                ],
                            },
                            {
                                key: "other_parent_guardian",
                                label: "Other Parent / Guardian",
                                purpose: "Additional parent or guardian adults linked to this household.",
                                owner: "household_component",
                                items: [
                                    { key: "person.primary_contact_name", label: "Name", kind: "field", namespace: "person" },
                                    { key: "person.phone", label: "Phone", kind: "field", namespace: "person" },
                                    { key: "person.email", label: "Email", kind: "field", namespace: "person" },
                                    { key: "person.role_label", label: "Role", kind: "field", namespace: "person" },
                                ],
                            },
                            {
                                key: "household_members",
                                label: "Additional Contacts",
                                purpose: "Other adults linked to this household.",
                                owner: "household_component",
                                items: [
                                    { key: "person.primary_contact_name", label: "Name", kind: "field", namespace: "person" },
                                    { key: "person.phone", label: "Phone", kind: "field", namespace: "person" },
                                    { key: "person.email", label: "Email", kind: "field", namespace: "person" },
                                    { key: "person.role_label", label: "Role", kind: "field", namespace: "person" },
                                    { key: "person.date_of_birth", label: "Date of Birth", kind: "field", namespace: "person" },
                                    { key: "person.address_line", label: "Address", kind: "field", namespace: "person" },
                                ],
                            },
                            {
                                key: "children",
                                label: "Children",
                                purpose: "Children belonging to this household (belonging-only).",
                                owner: "household_component",
                                items: [
                                    { key: "child.name", label: "Name", kind: "field", namespace: "child" },
                                    { key: "child.date_of_birth", label: "Date of Birth", kind: "field", namespace: "child" },
                                    { key: "child.dob_age", label: "Age", kind: "field", namespace: "child" },
                                    { key: "child.age", label: "Age (years)", kind: "field", namespace: "child" },
                                    { key: "inquiry_child.program", label: "Program", kind: "field", namespace: "inquiry_child" },
                                    { key: "inquiry_child.schedule_type", label: "Schedule", kind: "field", namespace: "inquiry_child" },
                                    { key: "child.start_date", label: "Start Date", kind: "field", namespace: "child" },
                                    { key: "child.status", label: "Status", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "emergency_contacts",
                                label: "Emergency Contact",
                                purpose: "Emergency contacts for this household.",
                                owner: "household_component",
                                items: [
                                    { key: "person.primary_contact_name", label: "Name", kind: "field", namespace: "person" },
                                    { key: "person.phone", label: "Phone", kind: "field", namespace: "person" },
                                    { key: "person.email", label: "Email", kind: "field", namespace: "person" },
                                    { key: "person.role_label", label: "Role", kind: "field", namespace: "person" },
                                ],
                            },
                            {
                                key: "authorized_pickups",
                                label: "Authorized Pickup",
                                purpose: "People authorized to pick up children.",
                                owner: "household_component",
                                items: [
                                    { key: "person.primary_contact_name", label: "Name", kind: "field", namespace: "person" },
                                    { key: "person.phone", label: "Phone", kind: "field", namespace: "person" },
                                    { key: "person.role_label", label: "Relationship", kind: "field", namespace: "person" },
                                ],
                            },
                            {
                                key: "billing_contact",
                                label: "Billing Contact",
                                purpose: "Who receives billing communications for this household?",
                                owner: "household_component",
                                items: [
                                    { key: "person.primary_contact_name", label: "Name", kind: "field", namespace: "person" },
                                    { key: "person.email", label: "Email", kind: "field", namespace: "person" },
                                    { key: "person.phone", label: "Phone", kind: "field", namespace: "person" },
                                ],
                            },
                            {
                                key: "emergency_medical",
                                label: "Emergency Medical",
                                purpose: "Emergency medical information for the household.",
                                owner: "household_component",
                                items: [
                                    { key: "person.primary_contact_name", label: "Physician", kind: "field", namespace: "person" },
                                    { key: "person.phone", label: "Physician Phone", kind: "field", namespace: "person" },
                                ],
                            },
                            {
                                key: "custom_notes",
                                label: "Custom Notes",
                                purpose: "Freeform notes for this household.",
                                owner: "household_component",
                                items: [
                                    { key: "person.role_label", label: "Note", kind: "field", namespace: "person" },
                                ],
                            },
                            {
                                key: "contact_edit",
                                label: "Contact Edit",
                                purpose: "Fields on the contact edit form.",
                                owner: "household_component",
                                items: [
                                    { key: "contact.first_name", label: "First name", kind: "field", namespace: "person" },
                                    { key: "contact.last_name", label: "Last name", kind: "field", namespace: "person" },
                                    { key: "contact.email", label: "Email", kind: "field", namespace: "person" },
                                    { key: "contact.phone", label: "Phone", kind: "field", namespace: "person" },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
};

// ── 1. Children Surface (Record → Record Surface, recursive) ───────────────────

export const childrenSurface: SurfaceSpec = {
    id: CHILDREN_SURFACE_ID,
    label: "Children",
    category: "focus_panel",
    grain: "child",
    version: 1,
    canvas: {
        rows: [
            {
                id: "row-identity",
                components: [
                    {
                        id: "child_component",
                        label: "Child",
                        componentType: "card",
                        width: "full",
                        evidenceGroups: [
                            {
                                key: "identity",
                                label: "Identity",
                                purpose: "Who is this child? Composed from presentation fields — never a single schema name.",
                                owner: "child_component",
                                items: [
                                    { key: "child.first_name", label: "First Name", kind: "field", namespace: "child" },
                                    { key: "child.last_name", label: "Last Name", kind: "field", namespace: "child" },
                                    { key: "child.preferred_name", label: "Preferred Name", kind: "field", namespace: "child" },
                                    { key: "child.nickname", label: "Nickname", kind: "field", namespace: "child" },
                                    { key: "child.date_of_birth", label: "DOB", kind: "field", namespace: "child" },
                                    { key: "child.dob_age", label: "Age", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "roster",
                                label: "Collapsed roster details",
                                purpose: "Extra fields per child row — collapsed until the operator expands View details.",
                                owner: "child_component",
                                items: [
                                    { key: "child.nickname", label: "Nickname", kind: "field", namespace: "child" },
                                    { key: "child.date_of_birth", label: "Date of Birth", kind: "field", namespace: "child" },
                                    { key: "child.dob_age", label: "Age", kind: "field", namespace: "child" },
                                    { key: "inquiry_child.program", label: "Program", kind: "field", namespace: "inquiry_child" },
                                    { key: "child.room", label: "Room", kind: "field", namespace: "child" },
                                    { key: "inquiry_child.schedule_type", label: "Schedule", kind: "field", namespace: "inquiry_child" },
                                    { key: "inquiry_child.desired_schedule_type", label: "Desired Schedule", kind: "field", namespace: "inquiry_child" },
                                    { key: "child.start_date", label: "Start Date", kind: "field", namespace: "child" },
                                    { key: "child.desired_start_date", label: "Desired Start", kind: "field", namespace: "child" },
                                    { key: "child.medical_summary", label: "Medical", kind: "field", namespace: "child" },
                                    { key: "child.documents_summary", label: "Documents", kind: "field", namespace: "child" },
                                    { key: "child.notes_summary", label: "Notes", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "placement",
                                label: "Placement",
                                purpose: "Where is this child placed?",
                                owner: "child_component",
                                items: [
                                    { key: "inquiry_child.program", label: "Program", kind: "field", namespace: "inquiry_child" },
                                    { key: "child.room", label: "Room", kind: "field", namespace: "child" },
                                    { key: "inquiry_child.desired_schedule_type", label: "Schedule", kind: "field", namespace: "inquiry_child" },
                                    { key: "child.desired_start_date", label: "Desired Start", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "readiness",
                                label: "Readiness",
                                purpose: "Is this child ready to enroll?",
                                owner: "child_component",
                                items: [
                                    { key: "child.readiness_summary", label: "Readiness", kind: "calculation", namespace: "child" },
                                ],
                            },
                            {
                                key: "child_edit",
                                label: "Child Edit",
                                purpose: "Fields on the child edit form.",
                                owner: "child_component",
                                items: [
                                    { key: "inquiry_child.program", label: "Program", kind: "field", namespace: "inquiry_child" },
                                    { key: "inquiry_child.schedule_type", label: "Schedule", kind: "field", namespace: "inquiry_child" },
                                    { key: "child.start_date", label: "Start Date", kind: "field", namespace: "child" },
                                    { key: "child.date_of_birth", label: "Date of Birth", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "medical",
                                label: "Medical",
                                purpose: "Medical evidence for this child.",
                                owner: "child_component",
                                items: [
                                    { key: "child.medical_summary", label: "Medical", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "documents",
                                label: "Documents",
                                purpose: "Document evidence for this child.",
                                owner: "child_component",
                                items: [
                                    { key: "child.documents_summary", label: "Documents", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "pickup",
                                label: "Pickup",
                                purpose: "Pickup authorization evidence.",
                                owner: "child_component",
                                items: [
                                    { key: "child.pickup_summary", label: "Pickup", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "communications",
                                label: "Communications",
                                purpose: "Communications evidence for this child.",
                                owner: "child_component",
                                items: [
                                    { key: "child.communications_summary", label: "Communications", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "notes",
                                label: "Notes",
                                purpose: "Notes evidence for this child.",
                                owner: "child_component",
                                items: [
                                    { key: "child.notes_summary", label: "Notes", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "nickname",
                                label: "Nickname",
                                purpose: "Preferred nickname evidence.",
                                owner: "child_component",
                                items: [
                                    { key: "child.nickname", label: "Nickname", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "custom_notes",
                                label: "Custom Notes",
                                purpose: "Operator-defined evidence section.",
                                owner: "child_component",
                                items: [
                                    { key: "child.notes_summary", label: "Note", kind: "field", namespace: "child" },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
};

// ── 2. Financial Configuration Surface (Operational → Operational) ─────────────

export const financialConfigurationSurface: SurfaceSpec = {
    id: FINANCIAL_CONFIG_SURFACE_ID,
    label: "Financial Configuration",
    category: "operational_config",
    grain: "case",
    version: 1,
    canvas: {
        rows: [
            {
                id: "row-config",
                components: [
                    {
                        id: "financial_config_component",
                        label: "Financial Configuration",
                        componentType: "config_panel",
                        width: "full",
                        evidenceGroups: [
                            {
                                key: "current_configuration",
                                label: "Current Configuration",
                                purpose: "What is the resolved financial configuration?",
                                owner: "financial_config_component",
                                items: [
                                    { key: "billing.tuition_rate", label: "Tuition Rate", kind: "field", namespace: "opportunity" },
                                    { key: "billing.discounts", label: "Discounts", kind: "field", namespace: "opportunity" },
                                    { key: "billing.resolved_total", label: "Resolved Total", kind: "calculation", namespace: "opportunity" },
                                ],
                            },
                            {
                                key: "configuration_history",
                                label: "Configuration History",
                                purpose: "How has this configuration changed over time?",
                                items: [
                                    { key: "billing.config_history", label: "History", kind: "related_list", namespace: "opportunity" },
                                ],
                            },
                            {
                                key: "configuration_actions",
                                label: "Actions",
                                purpose: "What can the operator do here?",
                                items: [
                                    {
                                        key: "billing.edit_configuration",
                                        label: "Edit Configuration",
                                        kind: "action",
                                        actions: [{ kind: "inline_edit", label: "Edit Configuration" }],
                                    },
                                ],
                            },
                            {
                                key: "billing_periods",
                                label: "Billing Periods",
                                purpose: "Domain-locked — billing periods are not configurable yet.",
                                items: [
                                    { key: "billing.periods", label: "Periods", kind: "related_list", namespace: "opportunity" },
                                ],
                            },
                            {
                                key: "line_items",
                                label: "Line Items",
                                purpose: "Domain-locked — line items are not configurable yet.",
                                items: [
                                    { key: "billing.line_items", label: "Line Items", kind: "related_list", namespace: "opportunity" },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
};

// ── Focus Panel surface — the components that OPEN the two surfaces ─────────────

export const focusPanelSurface: SurfaceSpec = {
    id: FOCUS_PANEL_SURFACE_ID,
    label: "Focus Panel",
    category: "focus_panel",
    grain: "case",
    version: 1,
    canvas: {
        rows: [
            {
                id: "row-primary",
                components: [
                    {
                        id: "household_card",
                        label: "Household",
                        componentType: "card",
                        width: "half",
                        depth: { expanded: { openSurfaceId: HOUSEHOLD_SURFACE_ID } },
                        evidenceGroups: [
                            {
                                key: "household_summary",
                                label: "Household Summary",
                                purpose: "Who belongs to this household?",
                                items: [
                                    { key: "person.primary_contact_name", label: "Primary Contact", kind: "field", namespace: "person" },
                                ],
                            },
                        ],
                    },
                    {
                        id: "children_card",
                        label: "Children",
                        componentType: "card",
                        width: "half",
                        // Expanded opens the Children Surface — NOT "more fields".
                        depth: { expanded: { openSurfaceId: CHILDREN_SURFACE_ID } },
                        evidenceGroups: [
                            {
                                key: "children_summary",
                                label: "Children Summary",
                                purpose: "Who are the children and their status?",
                                items: [
                                    { key: "children.summary", label: "Children", kind: "field", namespace: "child" },
                                ],
                            },
                        ],
                    },
                    {
                        id: "financial_configuration_card",
                        label: "Financial Configuration",
                        componentType: "config_panel",
                        width: "half",
                        // Workspace (larger work) opens the Financial Configuration Surface.
                        depth: { workspace: { openSurfaceId: FINANCIAL_CONFIG_SURFACE_ID } },
                        evidenceGroups: [
                            {
                                key: "billing_summary",
                                label: "Billing Summary",
                                purpose: "What is the resolved tuition at a glance?",
                                items: [
                                    { key: "billing.resolved_total", label: "Total", kind: "calculation", namespace: "opportunity" },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
};

/** All V3 proof surfaces, registered together at bootstrap. */
export const V3_PROOF_SURFACES: readonly SurfaceSpec[] = [
    focusPanelSurface,
    householdSurface,
    childrenSurface,
    financialConfigurationSurface,
];
