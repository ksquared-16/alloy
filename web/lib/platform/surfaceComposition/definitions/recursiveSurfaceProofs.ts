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
import {
    CHILD_SURFACE_ID,
    HOUSEHOLD_CONTACT_SURFACE_ID,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";

export const CHILDREN_SURFACE_ID = "children_surface";
export const FINANCIAL_CONFIG_SURFACE_ID = "financial_configuration_surface";
export const FOCUS_PANEL_SURFACE_ID = "focus_panel_surface";
export { CHILD_SURFACE_ID, HOUSEHOLD_CONTACT_SURFACE_ID, HOUSEHOLD_SURFACE_ID };

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
                                purpose: "Who is this child?",
                                owner: "child_component",
                                items: [
                                    {
                                        key: "child.name",
                                        label: "Name",
                                        kind: "field",
                                        namespace: "child",
                                        // Recursion: selecting a child re-composes THIS surface
                                        // for that child — a Record Surface opening itself.
                                        actions: [
                                            {
                                                kind: "handoff",
                                                label: "View child",
                                                openSurfaceId: CHILD_SURFACE_ID,
                                            },
                                        ],
                                    },
                                    { key: "child.date_of_birth", label: "Date of Birth", kind: "field", namespace: "child" },
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
                                    { key: "inquiry_child.schedule_type", label: "Schedule", kind: "field", namespace: "inquiry_child" },
                                    { key: "child.start_date", label: "Start date", kind: "field", namespace: "child" },
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
                        ],
                    },
                ],
            },
        ],
    },
};

// ── Child drill-in surface (per-child focus/edit) ─────────────────────────────

export const childSurface: SurfaceSpec = {
    id: CHILD_SURFACE_ID,
    label: "Child Detail",
    category: "focus_panel",
    grain: "child",
    version: 1,
    canvas: {
        rows: [
            {
                id: "row-child-focus",
                components: [
                    {
                        id: "child_focus_component",
                        label: "Child",
                        componentType: "card",
                        width: "full",
                        evidenceGroups: [
                            {
                                key: "identity",
                                label: "Identity",
                                purpose: "Child identity header",
                                owner: "child_focus_component",
                                items: [
                                    { key: "child.display_name", label: "Name", kind: "field", namespace: "child" },
                                    { key: "child.date_of_birth", label: "Date of birth", kind: "field", namespace: "child" },
                                    { key: "child.age", label: "Age", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "placement",
                                label: "Placement",
                                purpose: "Program, schedule, and start",
                                owner: "child_focus_component",
                                items: [
                                    { key: "inquiry_child.program", label: "Program", kind: "field", namespace: "inquiry_child" },
                                    { key: "child.room", label: "Room", kind: "field", namespace: "child" },
                                    { key: "inquiry_child.schedule_type", label: "Schedule", kind: "field", namespace: "inquiry_child" },
                                    { key: "child.start_date", label: "Start date", kind: "field", namespace: "child" },
                                ],
                            },
                            {
                                key: "readiness",
                                label: "Readiness",
                                purpose: "Enrollment readiness summary",
                                owner: "child_focus_component",
                                items: [
                                    { key: "child.readiness_summary", label: "Readiness", kind: "calculation", namespace: "child" },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
};

// ── Household detail surface ───────────────────────────────────────────────────

export const householdSurface: SurfaceSpec = {
    id: HOUSEHOLD_SURFACE_ID,
    label: "Household Detail",
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
                        depth: { expanded: { openSurfaceId: HOUSEHOLD_CONTACT_SURFACE_ID } },
                        evidenceGroups: [
                            { key: "primary_contact", label: "Primary contact", purpose: "Primary household contact", items: [] },
                            { key: "other_parent_guardian", label: "Other parent / guardian", purpose: "Secondary guardians", items: [] },
                            { key: "household_members", label: "Household members", purpose: "Other household members", items: [] },
                            { key: "emergency_contacts", label: "Emergency contacts", purpose: "Emergency contacts", items: [] },
                            { key: "authorized_pickups", label: "Authorized pickups", purpose: "Pickup authorization", items: [] },
                            { key: "children", label: "Children", purpose: "Children belonging to household", items: [] },
                            { key: "address", label: "Address", purpose: "Household address", items: [] },
                            { key: "billing_contact", label: "Billing contact", purpose: "Billing contact", items: [] },
                        ],
                    },
                ],
            },
        ],
    },
};

// ── Household contact edit surface ─────────────────────────────────────────────

export const householdContactSurface: SurfaceSpec = {
    id: HOUSEHOLD_CONTACT_SURFACE_ID,
    label: "Contact Detail",
    category: "focus_panel",
    grain: "case",
    version: 1,
    canvas: {
        rows: [
            {
                id: "row-contact",
                components: [
                    {
                        id: "household_contact_component",
                        label: "Contact",
                        componentType: "card",
                        width: "full",
                        evidenceGroups: [
                            {
                                key: "contact_fields",
                                label: "Contact fields",
                                purpose: "Editable contact fields",
                                owner: "household_contact_component",
                                items: [
                                    { key: "person.first_name", label: "First name", kind: "field", namespace: "person" },
                                    { key: "person.last_name", label: "Last name", kind: "field", namespace: "person" },
                                    { key: "person.email", label: "Email", kind: "field", namespace: "person" },
                                    { key: "person.phone", label: "Phone", kind: "field", namespace: "person" },
                                    { key: "person.date_of_birth", label: "Date of birth", kind: "field", namespace: "person" },
                                    { key: "person.address", label: "Address", kind: "field", namespace: "person" },
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
                                    { key: "household.summary", label: "Household", kind: "field", namespace: "person" },
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
                                    { key: "children", label: "Children", kind: "field", namespace: "child" },
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
    householdContactSurface,
    childrenSurface,
    childSurface,
    financialConfigurationSurface,
];
