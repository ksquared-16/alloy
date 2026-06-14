// UI-5A — Family Communication Workspace VM (shared contract for fixtures + API).
// Pure types. 5A populates family/children/recipients/eligibility/composerDraft.availableChannels;
// 5B/5C fields (threads/messages/timeline/health) are present as stable stubs.
export const FAMILY_WORKSPACE_RESOLVER_VERSION = "5a" as const;

export type ConsentState = "opted_in" | "opted_out" | "unset";
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

export type HealthSummary = {
    status: "healthy" | "at_risk" | "unresponsive";
    engagementScore: number;
    responseRate: number | null;
    lastContactAt: string | null;
    unreadCount: number;
};

export type ConsentSummary = {
    byContact: Record<string, { email: ConsentState; sms: ConsentState; marketing: ConsentState }>;
    displayFlags: { email: boolean; sms: boolean; marketing: boolean };
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
    // 5B/5C stubs:
    threads: unknown[];
    selectedThread: unknown | null;
    messages: unknown[];
    timelineEvents: unknown[];
    healthSummary: HealthSummary;
};
