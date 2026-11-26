/**
 * Universal Composition Model — Evidence Group Registry.
 *
 * Canonical named evidence groups per queue row zone and Focus Panel card.
 * These names are user-facing business sections, NOT abstract identifiers like
 * "Evidence Group 1". Every builder that renders an evidence group header MUST
 * use names from this registry.
 *
 * The registry maps:
 *   zone key  → named evidence group(s) for that queue row block
 *   card key  → named evidence group(s) for that Focus Panel card
 *
 * Within each group, the `fieldKeys` array lists the canonical field keys that
 * belong to the group by default. These match the fieldKey values in
 * `defaultLeadQueueLayoutV3()` / `defaultWaitlistQueueLayoutV3()`, giving
 * builders the ability to display per-field labels and controls rather than
 * treating the whole block as an atomic toggle.
 *
 * @see docs/platform/operator/experience-builder-universal-composition-model.md
 */

// ── Zone → evidence group map ─────────────────────────────────────────────────

/**
 * Entity namespaces a Composition Item can read from. Mirrors
 * `AvailableFieldEntityNamespace` in compositionFieldAdapter — declared here as a
 * local union to avoid a circular import between the registry and the adapter.
 */
export type CompositionEntityNamespace =
    | "opportunity"
    | "customer"
    | "person"
    | "child"
    | "inquiry_child"
    | "queue_row"
    | "concept";

/** One evidence group definition as seen in the builder inspector. */
export type CompositionEvidenceGroupDef = {
    /** Internal identifier — stable across renames. */
    key: string;
    /** Operator-facing label. Never abstract ("Evidence Group 1" is not allowed). */
    label: string;
    /** Purpose statement for inspector tooltip / help copy. */
    purpose?: string;
    /**
     * Default field keys that belong to this group, in display order.
     * These match the `fieldKey` values stored in QueueRecordFieldConfig.
     * Used to map flat field arrays back onto named groups in the inspector.
     *
     * V3 doctrine: `defaultFieldKeys` is what the group SEEDS with — it is NOT the
     * availability boundary. Availability is governed by `acceptedNamespaces`
     * (platform starter fields ∪ tenant custom fields whose namespace is accepted).
     * @see experience-builder-v3-universal-surface-composition.md §5
     */
    defaultFieldKeys: readonly string[];
    /**
     * Entity namespaces this group accepts Composition Items from. Drives
     * custom-field availability: a tenant field whose `entity_type` maps to one of
     * these namespaces becomes available in this group automatically — because the
     * EVIDENCE GROUP knows compatible namespaces, not because a component hardcodes
     * the field. Optional for back-compat; every canonical group declares it.
     */
    acceptedNamespaces?: readonly CompositionEntityNamespace[];
};

/**
 * Named evidence groups for each queue row zone.
 * A zone may have multiple groups (e.g. children zone: child summary + placement).
 * Most zones have one group.
 */
export const QUEUE_ZONE_EVIDENCE_GROUPS: Record<string, readonly CompositionEvidenceGroupDef[]> = {
    household: [
        {
            key: "primary_contact",
            label: "Primary Contact",
            purpose: "Who is this household and how do we reach them?",
            defaultFieldKeys: [
                "customer.display_name",
                "queue_row.subject_label",
                "person.primary_contact_name",
                "person.phone",
                "person.email",
            ],
            acceptedNamespaces: ["customer", "person"],
        },
    ],
    children: [
        {
            key: "child_summary",
            label: "Child Summary",
            purpose: "Who are the children and what is their current status?",
            defaultFieldKeys: [
                "child.name",
                "children",
                "child.date_of_birth",
                "child.gender",
                "child.dob_age",
                "child.status",
            ],
            acceptedNamespaces: ["child", "inquiry_child", "opportunity"],
        },
        {
            key: "placement",
            label: "Placement",
            purpose: "Where is each child placed?",
            defaultFieldKeys: [
                "inquiry_child.program",
                "inquiry_child.program_category",
                "child.room",
                "child.location",
                "inquiry_child.schedule_type",
                "child.start_date",
                "opportunity.location",
            ],
            acceptedNamespaces: ["child", "inquiry_child", "opportunity"],
        },
    ],
    status: [
        {
            key: "stage_disposition",
            label: "Stage & Disposition",
            purpose: "What is the enrollment stage and operational disposition?",
            defaultFieldKeys: [
                "queue_row.stage_label",
                "opportunity.status_label",
                "opportunity.location",
                "queue_row.group_count_label",
            ],
            acceptedNamespaces: ["opportunity"],
        },
    ],
    attention: [
        {
            key: "attention_signal",
            label: "Attention Signal",
            purpose: "What requires operator attention on this record?",
            defaultFieldKeys: [
                "opportunity.attention_reason",
                "queue_row.work_summary",
                "queue_row.next_best_action_label",
                "opportunity.next_step",
            ],
            acceptedNamespaces: ["opportunity"],
        },
    ],
    date_event: [
        {
            key: "date_event",
            label: "Date & Event",
            purpose: "What is the next scheduled touchpoint?",
            defaultFieldKeys: [
                "opportunity.tour_date",
            ],
            acceptedNamespaces: ["opportunity"],
        },
    ],
    actions: [],
};

// Waitlist-specific overrides for zones that differ in candidate grain
export const QUEUE_ZONE_EVIDENCE_GROUPS_WAITLIST: Partial<typeof QUEUE_ZONE_EVIDENCE_GROUPS> = {
    children: [
        {
            key: "candidate_summary",
            label: "Candidate Summary",
            purpose: "Who is the candidate and what is their waitlist position?",
            defaultFieldKeys: [
                "child.name",
                "children",
                "child.date_of_birth",
                "child.gender",
                "child.dob_age",
                "child.status",
            ],
            acceptedNamespaces: ["child", "inquiry_child", "opportunity"],
        },
        {
            key: "placement_request",
            label: "Placement Request",
            purpose: "What placement is this candidate waiting for?",
            defaultFieldKeys: [
                "inquiry_child.program_category",
                "inquiry_child.program",
                "inquiry_child.schedule_type",
                "child.start_date",
                "child.location",
            ],
            acceptedNamespaces: ["child", "inquiry_child", "opportunity"],
        },
        {
            key: "sibling_context",
            label: "Sibling Context",
            purpose: "Sibling enrollment context for waitlist placement.",
            defaultFieldKeys: [
                "waitlist.siblingContext",
                "sibling.names",
                "sibling.count",
                "sibling.enrolled",
                "sibling.waitlisted",
                "sibling.program",
                "sibling.location",
                "household.otherChildren",
            ],
            acceptedNamespaces: ["queue_row"],
        },
    ],
    status: [
        {
            key: "waitlist_position",
            label: "Waitlist & Placement",
            purpose: "Where is this candidate on the waitlist?",
            defaultFieldKeys: [
                "waitlist.positionLabel",
                "waitlist.tierLabel",
                "waitlist.waitSince",
                "waitlist.siblingContext",
                "queue_row.stage_label",
                "opportunity.status_label",
                "opportunity.location",
                "overrides.flags",
            ],
            acceptedNamespaces: ["opportunity"],
        },
    ],
};

/**
 * Resolve the evidence group definitions for a queue zone.
 * Merges waitlist overrides when `isWaitlist` is true.
 */
export function evidenceGroupsForZone(
    zone: string,
    isWaitlist = false,
): readonly CompositionEvidenceGroupDef[] {
    if (isWaitlist) {
        const override = QUEUE_ZONE_EVIDENCE_GROUPS_WAITLIST[zone];
        if (override) return override;
    }
    return QUEUE_ZONE_EVIDENCE_GROUPS[zone] ?? [];
}

// ── Focus Panel card → evidence group map ─────────────────────────────────────

/**
 * Named evidence group definitions for Focus Panel cards.
 * These match the `id` and `label` values in `defaultEvidenceGroupsForCard()`.
 * Used by builders and inspectors to seed named groups rather than generic labels.
 */
export const FOCUS_PANEL_CARD_EVIDENCE_GROUPS: Partial<Record<string, readonly CompositionEvidenceGroupDef[]>> = {
    household: [
        {
            key: "primary_contact",
            label: "Primary Contact",
            purpose: "Who is the primary contact for this household?",
            defaultFieldKeys: [
                "Enrollment → Primary Contact → Name",
                "Enrollment → Primary Contact → Phone",
                "Enrollment → Primary Contact → Email",
                "Enrollment → Primary Contact → Address",
                "Enrollment → Primary Contact → City",
                "Enrollment → Primary Contact → State",
                "Enrollment → Primary Contact → ZIP",
            ],
            acceptedNamespaces: ["customer", "person"],
        },
        {
            key: "additional_contacts",
            label: "Additional Contacts",
            purpose: "Who else is associated with this household?",
            defaultFieldKeys: ["Enrollment → Children → Summary", "Enrollment → Secondary Contact → Name", "Enrollment → Secondary Contact → Phone"],
            acceptedNamespaces: ["person", "customer"],
        },
    ],
    children: [
        { key: "identity", label: "Identity", purpose: "Who is this child?", defaultFieldKeys: ["Enrollment → Children → Name", "Enrollment → Children → DOB"], acceptedNamespaces: ["child", "inquiry_child"] },
        { key: "placement", label: "Placement", purpose: "Where is this child placed?", defaultFieldKeys: ["Enrollment → Children → Program", "Enrollment → Children → Room", "Enrollment → Children → Schedule", "Enrollment → Children → Teacher", "Enrollment → Children → Desired Start"], acceptedNamespaces: ["child", "inquiry_child"] },
        { key: "medical", label: "Medical", purpose: "What should we know medically?", defaultFieldKeys: [], acceptedNamespaces: ["child", "inquiry_child"] },
        { key: "documents", label: "Documents", purpose: "What documents are required?", defaultFieldKeys: [], acceptedNamespaces: ["child", "inquiry_child"] },
        { key: "readiness", label: "Readiness", purpose: "Is this child ready to enroll?", defaultFieldKeys: [], acceptedNamespaces: ["child", "inquiry_child", "opportunity"] },
        { key: "notes", label: "Notes", purpose: "Anything else to record?", defaultFieldKeys: [], acceptedNamespaces: ["child", "inquiry_child"] },
    ],
    billing_preview: [
        { key: "billing_responsibility", label: "Billing Responsibility", purpose: "Who is responsible for billing?", defaultFieldKeys: [], acceptedNamespaces: ["customer", "person"] },
        { key: "tuition", label: "Tuition", purpose: "What is the resolved tuition rate?", defaultFieldKeys: [], acceptedNamespaces: ["opportunity", "customer"] },
    ],
    readiness_kpi: [
        { key: "readiness_signals", label: "Readiness Signals", purpose: "What is blocking enrollment readiness?", defaultFieldKeys: [], acceptedNamespaces: ["opportunity", "child"] },
    ],
};

/**
 * Canonical label for a Focus Panel evidence group key.
 * Falls back to title-casing the key if not found in the registry.
 */
export function labelForFocusPanelGroup(cardKey: string, groupKey: string): string {
    const groups = FOCUS_PANEL_CARD_EVIDENCE_GROUPS[cardKey];
    if (groups) {
        const match = groups.find((g) => g.key === groupKey);
        if (match) return match.label;
    }
    // Fallback: title-case the key
    return groupKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Canonical label for a queue zone evidence group key.
 */
export function labelForQueueGroup(zone: string, groupKey: string, isWaitlist = false): string {
    const groups = evidenceGroupsForZone(zone, isWaitlist);
    const match = groups.find((g) => g.key === groupKey);
    if (match) return match.label;
    return groupKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
