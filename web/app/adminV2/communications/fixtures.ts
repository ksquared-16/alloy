// Communications V2 — DEV-ONLY UI fixtures.
// Lets the Command Center render the full target (family cards + Family Communication
// Workspace) WITHOUT any backend, so UX can be proven independent of DB/API state.
// Gated behind NEXT_PUBLIC_COMMS_V2_FIXTURES (static read -> client-inlined). When off,
// the component fetches real data exactly as before. No DB/route/provider/BOS coupling.
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";

export const COMMS_FIXTURES_ENABLED = process.env.NEXT_PUBLIC_COMMS_V2_FIXTURES === "1";

export type FixtureMessage = {
    id: string;
    direction: "inbound" | "outbound";
    channel: "email" | "sms" | "in_app";
    body: string;
    created_at: string;
    opened_at?: string | null;
    replied_at?: string | null;
    kind?: "message" | "note" | "system" | "call";
};

export type ConsentState = "opted_in" | "opted_out" | "unset";
export type FixtureFamilyDetail = {
    children: string;
    program: string;
    location: string;
    stage: string;
    owner: string;
    recipient: string;
    contactName: string;
    customerId?: string; // UI-5B: real customer (household) id to enable live workspace fetch
    consent: { email: ConsentState; sms: ConsentState; marketing: ConsentState };
};

const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();

export const FIXTURE_CONVERSATIONS: ConversationSummary[] = [
    { id: "fx-rivera",  family_label: "The Rivera Family",  topic_label: "Tour Scheduling", channel: "email", attention_state: "awaiting_parent_reply", assignment_state: "assigned",   assigned_user_id: "u-sj", location_id: null, sla_state: "overdue",  last_message_at: iso(6),   unread: 2, last_message_preview: "Is the preschool spot still open?" },
    { id: "fx-smith",   family_label: "The Smith Family",   topic_label: "Enrollment Packet", channel: "email", attention_state: "awaiting_parent_reply", assignment_state: "assigned",   assigned_user_id: "u-kk", location_id: null, sla_state: "on_track", last_message_at: iso(2),   unread: 0, last_message_preview: "Welcome to Little Oaks Academy" },
    { id: "fx-johnson", family_label: "The Johnson Family", topic_label: "Tour Follow-Up", channel: "email", attention_state: "needs_follow_up",       assignment_state: "unassigned", assigned_user_id: null,   location_id: null, sla_state: "due",      last_message_at: iso(26),  unread: 1, last_message_preview: "Checking in again re: your tour" },
    { id: "fx-garcia",  family_label: "The Garcia Family",  topic_label: "Immunization Records", channel: "sms",   attention_state: "documents_missing",      assignment_state: "assigned",   assigned_user_id: "u-am", location_id: null, sla_state: "on_track", last_message_at: iso(72),  unread: 0, last_message_preview: "Sending it over today", recipient_key: "+14155550142" },
    { id: "fx-nguyen",  family_label: "The Nguyen Family",  topic_label: "Re-enrollment", channel: "email", attention_state: "re_enrollment_outreach", assignment_state: "unassigned", assigned_user_id: null,   location_id: null, sla_state: "on_track", last_message_at: iso(48),  unread: 0, last_message_preview: "Yes, please send the forms" },
    { id: "fx-park",    family_label: "The Park Family",    topic_label: "Waitlist Update", channel: "sms",   attention_state: "waitlist_update",        assignment_state: "unassigned", assigned_user_id: null,   location_id: null, sla_state: "on_track", last_message_at: iso(120), unread: 1, last_message_preview: "Any update on our waitlist position?", recipient_key: "+14155550199" },
];

export const FIXTURE_FAMILY_DETAILS: Record<string, FixtureFamilyDetail> = {
    "fx-rivera":  { children: "Elena & Mateo", program: "Preschool", location: "North Campus", stage: "Tour complete", owner: "S. Jain",    recipient: "rivera@example.com", contactName: "Sarah Rivera",  consent: { email: "opted_in",  sms: "opted_in",  marketing: "opted_out" } },
    "fx-smith":   { children: "Emma & Liam",   program: "Toddlers",  location: "North Campus", stage: "Enrolling",     owner: "K. Kurzman", recipient: "smith@example.com", contactName: "Dana Smith",   consent: { email: "opted_in",  sms: "opted_in",  marketing: "opted_in" } },
    "fx-johnson": { children: "Mason",         program: "Infants",   location: "South Campus", stage: "Inquiry",       owner: "Unassigned", recipient: "johnson@example.com", contactName: "Mark Johnson", consent: { email: "opted_in",  sms: "unset",     marketing: "opted_out" } },
    "fx-garcia":  { children: "Sofia",         program: "Preschool", location: "North Campus", stage: "Enrolling",     owner: "A. Mehta",   recipient: "(415) 555-0142", contactName: "Lucia Garcia",      consent: { email: "opted_in",  sms: "opted_in",  marketing: "opted_in" } },
    "fx-nguyen":  { children: "Lan",           program: "Toddlers",  location: "East Campus",  stage: "Re-enrollment", owner: "Unassigned", recipient: "nguyen@example.com", contactName: "Minh Nguyen",  consent: { email: "opted_in",  sms: "opted_out", marketing: "opted_out" } },
    "fx-park":    { children: "Joon",          program: "Waitlist",  location: "North Campus", stage: "Waitlist",      owner: "Unassigned", recipient: "(415) 555-0199", contactName: "Grace Park",      consent: { email: "unset",     sms: "opted_in",  marketing: "unset" } },
};

export const FIXTURE_MESSAGES: Record<string, FixtureMessage[]> = {
    "fx-rivera": [
        { id: "m1", direction: "outbound", channel: "email",  body: "Tour confirmation & next steps for Elena & Mateo", created_at: iso(120), opened_at: iso(118) },
        { id: "m2", direction: "inbound",  channel: "sms",    body: "Thanks! We're very interested.", created_at: iso(116), kind: "message" },
        { id: "m3", direction: "outbound", channel: "email",  body: "Following up - are afternoons still best?", created_at: iso(30) },
        { id: "m4", direction: "inbound",  channel: "email",  body: "Is the preschool spot still open?", created_at: iso(6) },
        { id: "m5", direction: "outbound", channel: "in_app", body: "Parent prefers afternoons", created_at: iso(120), kind: "note" },
    ],
    "fx-smith": [
        { id: "m1", direction: "outbound", channel: "email",  body: "Enrollment next steps for Emma & Liam", created_at: iso(28), opened_at: iso(27), replied_at: iso(24) },
        { id: "m2", direction: "inbound",  channel: "sms",    body: "Tuesday works for the tour - thank you!", created_at: iso(24) },
        { id: "m3", direction: "outbound", channel: "in_app", body: "Enrollment packet completed", created_at: iso(20), kind: "system" },
        { id: "m4", direction: "outbound", channel: "email",  body: "Welcome to Little Oaks Academy", created_at: iso(2), opened_at: iso(1) },
    ],
    "fx-johnson": [
        { id: "m1", direction: "outbound", channel: "email", body: "Following up on your tour request", created_at: iso(48) },
        { id: "m2", direction: "outbound", channel: "email", body: "Checking in again re: your tour", created_at: iso(26) },
    ],
    "fx-garcia": [
        { id: "m1", direction: "outbound", channel: "sms", body: "We still need the immunization record", created_at: iso(96), opened_at: iso(95) },
        { id: "m2", direction: "inbound",  channel: "sms", body: "Sending it over today", created_at: iso(72), replied_at: iso(72) },
    ],
    "fx-nguyen": [
        { id: "m1", direction: "outbound", channel: "email", body: "Time to re-enroll for fall", created_at: iso(72), opened_at: iso(70) },
        { id: "m2", direction: "inbound",  channel: "email", body: "Yes, please send the forms", created_at: iso(48), replied_at: iso(48) },
    ],
    "fx-park": [
        { id: "m1", direction: "inbound", channel: "sms", body: "Any movement on the waitlist?", created_at: iso(120) },
    ],
};

// UI-4G: presentational conversation threads per family (dev-only; visual hierarchy, not wired).
export type FixtureThread = {
    id: string;
    subject: string;
    channel: "email" | "sms" | "in_app";
    messageCount: number;
    lastActivityAt: string;
    lastPreview: string;
    unread?: number;
};

export const FIXTURE_THREADS: Record<string, FixtureThread[]> = {
    "fx-rivera": [
        { id: "t-rivera-1", subject: "Preschool availability", channel: "email", messageCount: 4, lastActivityAt: iso(6), lastPreview: "Is the preschool spot still open?", unread: 2 },
        { id: "t-rivera-2", subject: "Tour confirmation & next steps", channel: "email", messageCount: 3, lastActivityAt: iso(30), lastPreview: "Following up - are afternoons still best?" },
        { id: "t-rivera-3", subject: "Program questions", channel: "sms", messageCount: 2, lastActivityAt: iso(116), lastPreview: "Thanks! We're very interested." },
    ],
    "fx-smith": [
        { id: "t-smith-1", subject: "Enrollment next steps", channel: "email", messageCount: 4, lastActivityAt: iso(2), lastPreview: "Welcome to Little Oaks Academy" },
        { id: "t-smith-2", subject: "Tour scheduling", channel: "sms", messageCount: 2, lastActivityAt: iso(24), lastPreview: "Tuesday works for the tour - thank you!" },
    ],
    "fx-johnson": [
        { id: "t-johnson-1", subject: "Tour request follow-up", channel: "email", messageCount: 2, lastActivityAt: iso(26), lastPreview: "Checking in again re: your tour", unread: 1 },
    ],
    "fx-garcia": [
        { id: "t-garcia-1", subject: "Immunization records", channel: "sms", messageCount: 2, lastActivityAt: iso(72), lastPreview: "Sending it over today" },
        { id: "t-garcia-2", subject: "Enrollment paperwork", channel: "email", messageCount: 3, lastActivityAt: iso(96), lastPreview: "Please complete the remaining forms" },
    ],
    "fx-nguyen": [
        { id: "t-nguyen-1", subject: "Fall re-enrollment", channel: "email", messageCount: 2, lastActivityAt: iso(48), lastPreview: "Yes, please send the forms" },
    ],
    "fx-park": [
        { id: "t-park-1", subject: "Waitlist status", channel: "sms", messageCount: 1, lastActivityAt: iso(120), lastPreview: "Any movement on the waitlist?", unread: 1 },
    ],
};
