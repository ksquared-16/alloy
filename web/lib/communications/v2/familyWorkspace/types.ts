// UI-5A — Family Communication Workspace VM (shared contract for fixtures + API).
// Pure types. 5A populates family/children/recipients/eligibility/composerDraft.availableChannels;
// 5B/5C fields (threads/messages/timeline/health) are present as stable stubs.
export const FAMILY_WORKSPACE_RESOLVER_VERSION = "5a" as const;

export type ConsentState = "opted_in" | "opted_out" | "unset";
export type PersonPreferenceProfile = {
    email_transactional: ConsentState;
    sms_transactional: ConsentState;
    email_marketing: ConsentState;
    sms_marketing: ConsentState;
};
export type ComposerChannel = "email" | "sms" | "note";
export type RecipientTier = "primary" | "secondary" | "excluded";

export type ChannelEligibility = {
    hasAddress: boolean;
    providerBound: boolean;
    available: boolean;
    unavailableReason: string | null;
    // consent is passive in 5A (no enforcement): always "unset", canSend mirrors availability
    marketing: ConsentState;
    transactional: ConsentState;
    canSendTransactional: boolean;
    canSendMarketing: boolean;
};

export type RecipientVM = {
    id: string; // person_id
    displayName: string;
    roleType: string | null;
    roleLabel: string | null;
    isPrimary: boolean;
    tier: Exclude<RecipientTier, "excluded">;
    email: string | null;
    phone: string | null;
    channels: { email: ChannelEligibility; sms: ChannelEligibility };
};

export type RecipientGroup = {
    tier: Exclude<RecipientTier, "excluded">;
    uiLabel: string;
    recipients: RecipientVM[];
};

export type ChildRef = {
    id: string; // customer_members.id
    personId: string | null;
    name: string;
    ageLabel: string | null;
    dob: string | null;
    program: string | null;
    stage: string | null;
    opportunityId: string | null;
};

export type FamilyRef = {
    id: string; // customers.id
    label: string;
    program: string | null;
    location: { id: string | null; label: string | null };
    stage: string | null;
    ownerUserId: string | null;
    ownerLabel: string | null;
    lifecycleStage: "lead" | "enrolled" | "unknown";
};

export type WorkspaceScope = {
    level: "family";
    customerId: string;
    focusChildId: string | null;
    focusOpportunityId: string | null;
    focusPersonId: string | null;
};

export type ThreadVM = {
    id: string;
    subject: string | null;
    channel: string | null;
    primaryEntity: { type: string; id: string };
    childId: string | null;        // customer_members.id when the thread is child-scoped
    opportunityId: string | null;  // opportunity id when opportunity-scoped
    lastActivityAt: string | null;
    messageCount: number;
    unread: number;
    slaState: string | null;
    attentionState: string | null;
};

export type TimelineEventVM = {
    id: string;
    threadId: string;
    direction: "inbound" | "outbound" | "internal" | string | null;
    channel: string | null;
    body: string | null;
    createdAt: string | null;
    kind: string | null;        // "message" | "note" | "system" | "call"
    deliveredAt: string | null;
    openedAt: string | null;
    repliedAt: string | null;
    sentAt: string | null;
    status: string | null; // derived: received | failed | replied | opened | delivered | sent | queued | null
    /** Outbound target person when present in message metadata. */
    recipientPersonId?: string | null;
    /** Operator auth user id when present in message metadata. */
    senderUserId?: string | null;
    senderDisplayName?: string | null;
};

export type HealthSummary = {
    status: "healthy" | "at_risk" | "unresponsive";
    engagementScore: number;
    responseRate: number | null;
    lastContactAt: string | null;
    unreadCount: number;
};

export type ConsentSummary = {
    byContact: Record<string, { email: ConsentState; sms: ConsentState; marketing: ConsentState }>;
    /** Primary-contact household display (legacy 3-field summary). */
    household: { email: ConsentState; sms: ConsentState; marketing: ConsentState };
    /** Primary-contact granular preference profile for edit UI. */
    preferenceProfile: PersonPreferenceProfile;
    /**
     * The granular profile for EACH contact, keyed by person id.
     *
     * Preferences are Person-owned: two adults in one household may differ, and
     * one of them saying STOP says nothing about the other. `preferenceProfile`
     * above collapses the household to its primary contact, which is right for a
     * one-line summary and wrong for anything an operator acts on — showing the
     * primary's answer beside a different recipient's name is a plain untruth
     * about who agreed to what.
     */
    preferenceProfilesByContact: Record<string, PersonPreferenceProfile>;
    displayFlags: { email: boolean; sms: boolean; marketing: boolean };
};

export type RelatedTaskBrief = {
    id: string;
    title: string;
    dueAt: string;
    status: string;
};

export type ComposerDraftVM = {
    channel: ComposerChannel;
    recipientContactIds: string[];
    subject: string | null;
    body: string;
    availableChannels: { email: boolean; sms: boolean; note: boolean; reasons: Record<string, string> };
    consentBlockers: Array<{ contactId: string; channel: string; reason: string }>;
};

export type FamilyCommunicationWorkspaceVM = {
    family: FamilyRef;
    children: ChildRef[];
    recipientGroups: RecipientGroup[];
    eligibleRecipients: RecipientVM[];
    disabledRecipients: RecipientVM[];
    selectedRecipients: string[];
    consentSummary: ConsentSummary;
    composerDraft: ComposerDraftVM;
    scope: WorkspaceScope;
    // 5B real conversation data:
    threads: ThreadVM[];
    selectedThread: ThreadVM | null;
    messages: TimelineEventVM[];     // selected thread's events
    timelineEvents: TimelineEventVM[]; // aggregated across all family threads (chronological asc)
    healthSummary: HealthSummary;     // 5C
    /** Open operational tasks for the focused opportunity (when resolvable). */
    relatedTasks: RelatedTaskBrief[];
};

/**
 * Path C — lightweight Activity communications FIRST-PAINT VM.
 *
 * Loads with the selected Focus Panel record (row-select), so Activity can render the real
 * workspace (channels, recipients, recent thread, composer defaults) with NO blank shell.
 * Deliberately excludes the heavy tail the full VM adds later (consent/preferences bundle,
 * related tasks, full timeline health) — those revalidate in the background after mount.
 *
 * SMS enable/disable + eligibility come from the SAME assembler rules as the full VM
 * (projected, never recomputed) — this VM does not change eligibility, provider, or send logic.
 */
export const FAMILY_WORKSPACE_PREVIEW_VERSION = "preview-1" as const;

export type FamilyCommunicationWorkspacePreviewVM = {
    version: typeof FAMILY_WORKSPACE_PREVIEW_VERSION;
    family: FamilyRef;
    children: ChildRef[];
    recipientGroups: RecipientGroup[];
    eligibleRecipients: RecipientVM[];
    disabledRecipients: RecipientVM[];
    selectedRecipients: string[];
    /** Provider channel availability + SMS/email disabled reasons + default recipients. */
    composerDraft: ComposerDraftVM;
    scope: WorkspaceScope;
    /** Recent threads (capped) needed for first paint. */
    recentThreads: ThreadVM[];
    /** Latest messages across the family (capped, chronological asc) for first paint. */
    recentTimelineEvents: TimelineEventVM[];
};
