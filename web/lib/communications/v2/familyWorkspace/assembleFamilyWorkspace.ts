// UI-5A — PURE assembly: raw rows -> VM. No I/O (only pure helpers), so it is unit-testable
// without the Supabase client.
import { availableComposerChannels, type BindingSummary } from "@/lib/communications/composerChannels";
import { trimEmail, smsToOrNull, personLabel } from "./normalizeRecipientContact";
import { tierForRoleType, compareRecipientsForTier, TIER_UI_LABEL } from "./recipientTierPolicy";
import { buildChannelEligibility } from "./buildChannelEligibility";
import { stubFamilyWorkspaceTail } from "./stubFamilyWorkspaceTail";
import { aggregateFamilyThreads, type RawThreadRow, type RawMessageRow } from "./aggregateFamilyTimeline";
import { resolveHouseholdConsentDisplay, resolveHouseholdPreferenceProfile, type PersonConsentTriplet } from "@/lib/communications/v2/householdCommunicationPreferences";
import type { RawFamilyWorkspaceData } from "./loadFamilyWorkspaceData";
import type { FamilyCommunicationWorkspaceVM, RecipientVM, RecipientGroup, ChildRef, ComposerChannel, RelatedTaskBrief, PersonPreferenceProfile } from "./types";

export type ResolveFamilyWorkspaceOptions = {
    customerId: string;
    focusChildId?: string | null;
    focusOpportunityId?: string | null;
    composerChannel?: ComposerChannel;
    selectedThreadId?: string | null;
    focusPersonId?: string | null;
    viewerUserId?: string | null;
    /** Resolved business-process stage label (from opportunity drawer status path). */
    familyStageLabel?: string | null;
    /** Loaded from communication_preferences (person-scoped). */
    preferencesByContact?: Record<string, PersonConsentTriplet>;
    preferenceProfilesByContact?: Record<string, PersonPreferenceProfile>;
    relatedTasks?: RelatedTaskBrief[];
};

export type FamilyCommsRaw = { threads: RawThreadRow[]; messages: RawMessageRow[] };

function ageLabel(dob: string | null | undefined): string | null {
    if (!dob) return null;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let y = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
    if (y <= 0) {
        const months = Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + m);
        return `${months}m`;
    }
    return `${y}`;
}

function humanizeRole(roleType: string | null | undefined): string | null {
    const k = (roleType ?? "").trim();
    if (!k) return null;
    return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function inThePast(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

export function assembleFamilyWorkspace(
    raw: RawFamilyWorkspaceData,
    opts: ResolveFamilyWorkspaceOptions,
    comms?: FamilyCommsRaw
): FamilyCommunicationWorkspaceVM {
    const channel: ComposerChannel = opts.composerChannel ?? "email";
    const providerChannels = availableComposerChannels(raw.bindings as unknown as BindingSummary[]);
    const roleLabelByKey = new Map<string, string>();
    for (const r of raw.roleTypes) if (r.key) roleLabelByKey.set(r.key.toLowerCase(), r.label ?? "");
    const personById = new Map(raw.persons.map((p) => [p.id, p]));

    const childPersonIds = new Set<string>();
    const children: ChildRef[] = raw.members.map((m) => {
        if (m.person_id) childPersonIds.add(m.person_id);
        const name = (m.display_name ?? "").trim() || [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || "Child";
        return { id: m.id, personId: m.person_id ?? null, name, ageLabel: ageLabel(m.dob), dob: m.dob ?? null, program: null, stage: null, opportunityId: null };
    });

    type Link = { personId: string; roleType: string | null; isPrimary: boolean; endDate?: string | null };
    const linkByPerson = new Map<string, Link>();
    for (const cp of raw.customerPersons) {
        if (!cp.person_id) continue;
        linkByPerson.set(cp.person_id, { personId: cp.person_id, roleType: cp.role_type ?? null, isPrimary: !!cp.is_primary, endDate: cp.end_date ?? null });
    }
    for (const op of raw.opportunityPersons) {
        if (!op.person_id || linkByPerson.has(op.person_id)) continue;
        linkByPerson.set(op.person_id, { personId: op.person_id, roleType: op.role_type ?? null, isPrimary: false });
    }

    const recipients: RecipientVM[] = [];
    for (const link of linkByPerson.values()) {
        if (childPersonIds.has(link.personId)) continue;
        if (inThePast(link.endDate)) continue;
        const tier = tierForRoleType(link.roleType);
        if (tier === "excluded") continue;
        const person = personById.get(link.personId);
        if (!person) continue;
        const archived = !!person.archived_at;
        if (archived) continue; // archived persons are not messageable recipients
        const email = trimEmail(person.email);
        const phone = smsToOrNull(person.phone);
        recipients.push({
            id: link.personId,
            displayName: personLabel(person),
            roleType: link.roleType,
            roleLabel: roleLabelByKey.get((link.roleType ?? "").toLowerCase()) || humanizeRole(link.roleType),
            isPrimary: link.isPrimary,
            tier,
            email,
            phone,
            channels: buildChannelEligibility({ email, phone, archived, providerChannels, metadata: person.metadata }),
        });
    }

    const primary = recipients.filter((r) => r.tier === "primary").sort(compareRecipientsForTier);
    const secondary = recipients.filter((r) => r.tier === "secondary").sort(compareRecipientsForTier);
    const recipientGroups: RecipientGroup[] = [];
    if (primary.length) recipientGroups.push({ tier: "primary", uiLabel: TIER_UI_LABEL.primary, recipients: primary });
    if (secondary.length) recipientGroups.push({ tier: "secondary", uiLabel: TIER_UI_LABEL.secondary, recipients: secondary });

    const isEligible = (r: RecipientVM): boolean => (channel === "note" ? true : r.channels[channel].available);
    const ordered = [...primary, ...secondary];
    const eligibleRecipients = ordered.filter(isEligible);
    const disabledRecipients = ordered.filter((r) => !isEligible(r));
    const eligiblePrimaryIds = primary.filter(isEligible).map((r) => r.id);
    const selectedRecipients = eligiblePrimaryIds.length ? eligiblePrimaryIds : eligibleRecipients.slice(0, 1).map((r) => r.id);

    const byContact: Record<string, PersonConsentTriplet> = {};
    for (const r of recipients) {
        byContact[r.id] = opts.preferencesByContact?.[r.id] ?? { email: "unset", sms: "unset", marketing: "unset" };
    }
    const primaryPersonId = raw.customer?.primary_contact_id ?? recipients.find((r) => r.isPrimary)?.id ?? null;
    const household = resolveHouseholdConsentDisplay(byContact, primaryPersonId, recipients.map((r) => r.id));
    const preferenceProfile = resolveHouseholdPreferenceProfile(
        opts.preferenceProfilesByContact ?? {},
        primaryPersonId,
        recipients.map((r) => r.id)
    );

    const focusOpportunityId = opts.focusOpportunityId ?? raw.opportunities[0]?.id ?? null;

    const channelReasons: Record<string, string> = {};
    if (!providerChannels.includes("email")) {
        channelReasons.email = "Email provider is not configured for this organization.";
    } else if (!recipients.some((r) => r.channels.email.available)) {
        channelReasons.email = "No email-capable recipient exists for this family.";
    }
    if (!providerChannels.includes("sms")) {
        channelReasons.sms = "SMS provider is not configured for this organization.";
    } else if (!recipients.some((r) => r.channels.sms.available)) {
        channelReasons.sms = "SMS unavailable because no SMS-capable recipient exists.";
    }
    if (!focusOpportunityId) {
        channelReasons.tasks = "No enrollment opportunity is linked to this family, so related tasks cannot be loaded.";
    }

    const newestOpp = raw.opportunities[0] ?? null;
    const enrolledLike = !!(raw.customer?.status_key && /enrol/i.test(raw.customer.status_key));
    const lifecycleStage = enrolledLike ? "enrolled" : raw.opportunities.length > 0 ? "lead" : "unknown";

    return {
        family: {
            id: raw.customer?.id ?? opts.customerId,
            label: (raw.customer?.name ?? "Family").trim() || "Family",
            program: null,
            location: { id: newestOpp?.location_id ?? null, label: null },
            stage: opts.familyStageLabel ?? null,
            ownerUserId: null,
            ownerLabel: null,
            lifecycleStage,
        },
        children,
        recipientGroups,
        eligibleRecipients,
        disabledRecipients,
        selectedRecipients,
        consentSummary: {
            byContact,
            household,
            preferenceProfile,
            // Per-person, unaggregated. The household roll-up above stays for the
            // summary line; anything an operator edits must name the Person whose
            // preference it actually is.
            preferenceProfilesByContact: opts.preferenceProfilesByContact ?? {},
            displayFlags: {
                email: true,
                sms: true,
                marketing: true,
            },
        },
        composerDraft: {
            channel,
            recipientContactIds: selectedRecipients,
            subject: null,
            body: "",
            availableChannels: {
                email: providerChannels.includes("email"),
                sms: providerChannels.includes("sms"),
                note: true,
                reasons: channelReasons,
            },
            consentBlockers: [],
        },
        scope: {
            level: "family",
            customerId: opts.customerId,
            focusChildId: opts.focusChildId ?? null,
            focusOpportunityId,
            focusPersonId: opts.focusPersonId ?? null,
        },
        relatedTasks: opts.relatedTasks ?? [],
        ...buildConversationTail(raw, opts, comms),
    };
}

function buildConversationTail(raw: RawFamilyWorkspaceData, opts: ResolveFamilyWorkspaceOptions, comms?: FamilyCommsRaw) {
    const base = stubFamilyWorkspaceTail();
    if (!comms) return base;
    const childPersonIdToMemberId: Record<string, string> = {};
    for (const m of raw.members) if (m.person_id) childPersonIdToMemberId[m.person_id] = m.id;
    const opportunityIds = new Set(raw.opportunities.map((o) => o.id).filter(Boolean));
    const agg = aggregateFamilyThreads(comms.threads, comms.messages, {
        childPersonIdToMemberId,
        opportunityIds,
        selectedThreadId: opts.selectedThreadId ?? null,
    });
    return {
        ...base,
        threads: agg.threads,
        selectedThread: agg.selectedThread,
        messages: agg.selectedMessages,
        timelineEvents: agg.timelineEvents,
        healthSummary: {
            ...base.healthSummary,
            unreadCount: agg.familyUnread,
            lastContactAt: agg.lastFamilyActivityAt ?? base.healthSummary.lastContactAt,
        },
    };
}
