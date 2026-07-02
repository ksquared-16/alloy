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

export const CHILDREN_SURFACE_ID = "children_surface";
export const FINANCIAL_CONFIG_SURFACE_ID = "financial_configuration_surface";
export const FOCUS_PANEL_SURFACE_ID = "focus_panel_surface";

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
                                                openSurfaceId: CHILDREN_SURFACE_ID,
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
    childrenSurface,
    financialConfigurationSurface,
];
