"use client";

/* eslint-disable react/no-unescaped-entities */

/**
 * Universal Card archetype reference mocks (presentation only).
 *
 * Self-contained scoped `acm-` styles so it renders identically with or without
 * the AdminV2 runtime stylesheet. These are MOCKS — they do not import or modify
 * any production card. One reference card per archetype:
 *
 *   Process · Work · Intelligence · Collection (Children) · Communication ·
 *   Financial · Activity · Metrics
 *
 * Identity is already implemented (Household). Each mock shows Overview,
 * Evidence/expanded, Focused, Empty, Missing/risk, and a Mobile density, plus
 * transition/performance notes. Every card answers ONE operational question and
 * observes the Operational Context (truth elided in fixtures).
 */

import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Shared card chrome (neutral; semantic color only as rail / badge / warning)
// ─────────────────────────────────────────────────────────────────────────────

type Tone = "neutral" | "work" | "metric" | "risk" | "positive";

function Card({
    title,
    icon,
    answer,
    supporting,
    badge,
    badgeTone = "neutral",
    rail,
    footer,
    children,
    mobile = false,
}: {
    title: string;
    icon: string;
    answer: ReactNode;
    supporting?: ReactNode;
    badge?: string | null;
    badgeTone?: Tone;
    rail?: Tone | null;
    footer?: ReactNode;
    children?: ReactNode;
    mobile?: boolean;
}) {
    return (
        <div className={`acm-card${mobile ? " acm-card--mobile" : ""}`} data-rail={rail ?? undefined}>
            <div className="acm-card__head">
                <span className="acm-card__icon" aria-hidden>{icon}</span>
                <span className="acm-card__title">{title}</span>
                {badge ? <span className={`acm-badge acm-badge--${badgeTone}`}>{badge}</span> : null}
            </div>
            <div className="acm-card__insight">
                <div className="acm-card__answer">{answer}</div>
                {supporting ? <div className="acm-card__supporting">{supporting}</div> : null}
            </div>
            {children ? <div className="acm-card__body">{children}</div> : null}
            {footer ? <div className="acm-card__footer">{footer}</div> : null}
        </div>
    );
}

function Empty({ label }: { label: string }) {
    return <div className="acm-empty">{label}</div>;
}

function Row({
    lead,
    name,
    detail,
    trailing,
    tone,
}: {
    lead?: string;
    name: ReactNode;
    detail?: ReactNode;
    trailing?: ReactNode;
    tone?: Tone;
}) {
    return (
        <div className="acm-row" data-tone={tone ?? undefined}>
            {lead ? <span className="acm-avatar" aria-hidden>{lead}</span> : null}
            <span className="acm-row__main">
                <span className="acm-row__name">{name}</span>
                {detail ? <span className="acm-row__detail">{detail}</span> : null}
            </span>
            {trailing ? <span className="acm-row__trailing">{trailing}</span> : null}
        </div>
    );
}

function MiniAction({ label, primary = false }: { label: string; primary?: boolean }) {
    return <span className={`acm-action${primary ? " acm-action--primary" : ""}`}>{label}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// State panel layout
// ─────────────────────────────────────────────────────────────────────────────

function StatePanel({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="acm-state">
            <div className="acm-state__label">{label}</div>
            <div className="acm-state__stage">{children}</div>
        </div>
    );
}

function ArchetypeSection({
    archetype,
    cardName,
    question,
    notes,
    children,
}: {
    archetype: string;
    cardName: string;
    question: string;
    notes: { transition: string; performance: string };
    children: ReactNode;
}) {
    return (
        <section className="acm-section">
            <header className="acm-section__head">
                <div className="acm-section__titles">
                    <span className="acm-section__archetype">{archetype}</span>
                    <h2 className="acm-section__card">{cardName}</h2>
                </div>
                <p className="acm-section__question">"{question}"</p>
            </header>
            <div className="acm-states">{children}</div>
            <div className="acm-notes">
                <p><strong>Transition:</strong> {notes.transition}</p>
                <p><strong>Performance:</strong> {notes.performance}</p>
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Process — Tour Card
// ─────────────────────────────────────────────────────────────────────────────

function ProcessSteps({ active }: { active: number }) {
    const steps = ["Requested", "Scheduled", "Confirmed", "Completed", "Follow-up"];
    return (
        <div className="acm-steps">
            {steps.map((s, i) => (
                <div key={s} className="acm-step" data-state={i < active ? "done" : i === active ? "current" : "todo"}>
                    <span className="acm-step__dot" aria-hidden>{i < active ? "✓" : i === active ? "●" : "○"}</span>
                    <span className="acm-step__label">{s}</span>
                </div>
            ))}
        </div>
    );
}

function ProcessCardSection() {
    return (
        <ArchetypeSection
            archetype="Process"
            cardName="Tour Card"
            question="Where is this family in the tour process?"
            notes={{
                transition:
                    "Overview → Evidence reveals the full step rail in place (height grow, 160ms). Focusing a step is local UI — no fetch, no route change. Advancing a step is an action (Change Subject stays the same record).",
                performance:
                    "Step states derive from the already-loaded process snapshot in context.truth. No per-step request; the active step is highlighted from stage data.",
            }}
        >
            <StatePanel label="Overview">
                <Card title="Tour" icon="🗓️" answer="Tour confirmed — Fri Jun 27, 10:00 AM" supporting="Confirmed 2h ago" badge="On track" badgeTone="positive" rail="positive" footer={<MiniAction label="View process →" />} />
            </StatePanel>
            <StatePanel label="Evidence / expanded">
                <Card title="Tour" icon="🗓️" answer="Tour confirmed — Fri Jun 27, 10:00 AM" badge="On track" badgeTone="positive" rail="positive" footer={<MiniAction label="Show less" />}>
                    <ProcessSteps active={3} />
                </Card>
            </StatePanel>
            <StatePanel label="Focused step">
                <Card title="Tour · Completed" icon="🗓️" answer="Mark tour completed" supporting="Step 4 of 5" footer={<><MiniAction label="← All steps" /><MiniAction label="Mark complete" primary /></>}>
                    <Row name="Scheduled for" detail="Fri Jun 27, 10:00 AM" />
                    <Row name="Host" detail="Center director" />
                    <Row name="Attendees" detail="Sarah Johnson + 2 children" />
                </Card>
            </StatePanel>
            <StatePanel label="Empty">
                <Card title="Tour" icon="🗓️" answer="No tour activity yet" supporting="Schedule a tour to begin">
                    <Empty label="No steps recorded" />
                </Card>
            </StatePanel>
            <StatePanel label="Missing / risk">
                <Card title="Tour" icon="🗓️" answer="Tour unconfirmed — 18h away" supporting="No confirmation from family" badge="Needs confirm" badgeTone="risk" rail="risk" footer={<MiniAction label="Confirm tour" primary />}>
                    <ProcessSteps active={2} />
                </Card>
            </StatePanel>
            <StatePanel label="Mobile">
                <Card mobile title="Tour" icon="🗓️" answer="Tour confirmed" supporting="Fri 10:00 AM" badge="On track" badgeTone="positive" rail="positive" />
            </StatePanel>
        </ArchetypeSection>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Work — Current Work Card
// ─────────────────────────────────────────────────────────────────────────────

function WorkCardSection() {
    return (
        <ArchetypeSection
            archetype="Work"
            cardName="Current Work Card"
            question="What needs to happen next on this record?"
            notes={{
                transition:
                    "Overview shows the single most-urgent task. Evidence expands the full task list (local). Focusing a task reveals its detail inline; completing it is an action that mutates the record in place.",
                performance:
                    "Tasks come from the composed work summary already in context.truth. Counts and due states are precomputed; no card-level task fetch on expand.",
            }}
        >
            <StatePanel label="Overview">
                <Card title="Current work" icon="✓" answer="Confirm tour booking" supporting="Due today · 2 open tasks" badge="2 open" badgeTone="work" rail="work" footer={<MiniAction label="View work →" />} />
            </StatePanel>
            <StatePanel label="Evidence / expanded">
                <Card title="Current work" icon="✓" answer="2 open tasks · 1 due today" badge="2 open" badgeTone="work" rail="work" footer={<MiniAction label="Show less" />}>
                    <Row lead="●" name="Confirm tour booking" detail="Due today" trailing={<MiniAction label="Do" />} tone="work" />
                    <Row lead="○" name="Send enrollment packet" detail="Due Mon" trailing={<MiniAction label="Do" />} />
                </Card>
            </StatePanel>
            <StatePanel label="Focused task">
                <Card title="Confirm tour booking" icon="✓" answer="Due today" supporting="Source: BOS Assist" footer={<><MiniAction label="← All work" /><MiniAction label="Complete" primary /></>}>
                    <Row name="Assigned" detail="Front desk" />
                    <Row name="Created" detail="Jun 25 by workflow" />
                    <Row name="Related" detail="Tour step · Confirmed" />
                </Card>
            </StatePanel>
            <StatePanel label="Empty">
                <Card title="Current work" icon="✓" answer="No open work" supporting="Nothing needs action right now" badge="Clear" badgeTone="positive">
                    <Empty label="All caught up" />
                </Card>
            </StatePanel>
            <StatePanel label="Missing / risk">
                <Card title="Current work" icon="✓" answer="1 task overdue" supporting="Confirm tour booking · 2 days late" badge="Overdue" badgeTone="risk" rail="risk" footer={<MiniAction label="Resolve now" primary />}>
                    <Row lead="!" name="Confirm tour booking" detail="Overdue 2 days" tone="risk" trailing={<MiniAction label="Do" primary />} />
                </Card>
            </StatePanel>
            <StatePanel label="Mobile">
                <Card mobile title="Current work" icon="✓" answer="Confirm tour booking" supporting="Due today" badge="2 open" badgeTone="work" rail="work" />
            </StatePanel>
        </ArchetypeSection>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Intelligence — Readiness Card
// ─────────────────────────────────────────────────────────────────────────────

function Gauge({ value, tone }: { value: number; tone: Tone }) {
    return (
        <div className="acm-gauge" data-tone={tone}>
            <div className="acm-gauge__track"><div className="acm-gauge__fill" style={{ width: `${value}%` }} /></div>
            <span className="acm-gauge__value">{value}%</span>
        </div>
    );
}

function ReadinessChecklist({ docsOk = false }: { docsOk?: boolean }) {
    return (
        <>
            <Row lead="✓" name="Primary contact" detail="Complete" tone="positive" />
            <Row lead="✓" name="Children linked" detail="3 children" tone="positive" />
            <Row lead={docsOk ? "✓" : "✗"} name="Documents" detail={docsOk ? "Complete" : "2 missing"} tone={docsOk ? "positive" : "risk"} />
            <Row lead="●" name="Tour" detail="Scheduled" tone="work" />
        </>
    );
}

function IntelligenceCardSection() {
    return (
        <ArchetypeSection
            archetype="Intelligence"
            cardName="Readiness Card"
            question="Is this family ready to advance?"
            notes={{
                transition:
                    "Overview shows a single readiness signal (score + verdict). Evidence reveals the contributing checklist (local). Focusing a blocker shows why it fails and the action to clear it.",
                performance:
                    "Readiness is a pure derivation over context.truth (contacts, children, docs, process). It is computed once with the card; no scoring request.",
            }}
        >
            <StatePanel label="Overview">
                <Card title="Readiness" icon="◐" answer="72% ready to advance" supporting="1 blocker before enrollment" badge="Almost" badgeTone="metric" rail="metric">
                    <Gauge value={72} tone="metric" />
                </Card>
            </StatePanel>
            <StatePanel label="Evidence / expanded">
                <Card title="Readiness" icon="◐" answer="72% ready" supporting="3 of 4 signals complete" rail="metric" footer={<MiniAction label="Show less" />}>
                    <Gauge value={72} tone="metric" />
                    <ReadinessChecklist />
                </Card>
            </StatePanel>
            <StatePanel label="Focused blocker">
                <Card title="Readiness · Documents" icon="◐" answer="2 documents missing" supporting="Blocks enrollment" badge="Blocker" badgeTone="risk" rail="risk" footer={<><MiniAction label="← Readiness" /><MiniAction label="Request docs" primary /></>}>
                    <Row lead="✗" name="Immunization record" detail="Not received" tone="risk" />
                    <Row lead="✗" name="Signed enrollment form" detail="Sent, awaiting signature" tone="risk" />
                </Card>
            </StatePanel>
            <StatePanel label="Empty">
                <Card title="Readiness" icon="◐" answer="Not enough info to assess" supporting="Add contact + children to score">
                    <Empty label="No readiness signals yet" />
                </Card>
            </StatePanel>
            <StatePanel label="Missing / risk">
                <Card title="Readiness" icon="◐" answer="Blocked — immunizations missing" supporting="Cannot advance to enrolled" badge="Blocked" badgeTone="risk" rail="risk" footer={<MiniAction label="Request docs" primary />}>
                    <Gauge value={45} tone="risk" />
                    <ReadinessChecklist />
                </Card>
            </StatePanel>
            <StatePanel label="Mobile">
                <Card mobile title="Readiness" icon="◐" answer="72% ready" supporting="1 blocker" badge="Almost" badgeTone="metric" rail="metric">
                    <Gauge value={72} tone="metric" />
                </Card>
            </StatePanel>
        </ArchetypeSection>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Collection — Children Card (PRIORITY)
//    "What is true for this child right now?"
// ─────────────────────────────────────────────────────────────────────────────

type ChildFixture = {
    name: string;
    dobAge: string;
    program: string;
    room: string;
    schedule: string;
    status: string;
    statusTone: Tone;
    startDate: string;
    flags?: { label: string; tone: Tone }[];
};

const CHILDREN_FX: ChildFixture[] = [
    { name: "Emma Johnson", dobAge: "Mar 3, 2020 · 6y", program: "Preschool", room: "Sunflower", schedule: "M–F · Full day", status: "Enrolled", statusTone: "positive", startDate: "Started Aug 26, 2025" },
    { name: "Liam Johnson", dobAge: "Nov 14, 2021 · 4y", program: "Toddler", room: "Acorn", schedule: "M/W/F · Half day", status: "Enrolled", statusTone: "positive", startDate: "Started Aug 26, 2025", flags: [{ label: "Allergy: peanuts", tone: "risk" }] },
    { name: "Noah Johnson", dobAge: "Jun 1, 2023 · 3y", program: "Infant", room: "Pending", schedule: "Not set", status: "Waitlisted", statusTone: "work", startDate: "Requested Sep 2026", flags: [{ label: "Immunization record missing", tone: "risk" }] },
];

function ChildSummaryRow({ c }: { c: ChildFixture }) {
    return (
        <Row
            lead={c.name.charAt(0)}
            name={c.name}
            detail={`${c.dobAge} · ${c.program}`}
            trailing={<span className="acm-pill" data-tone={c.statusTone}>{c.status}</span>}
        />
    );
}

function ChildEvidenceRow({ c }: { c: ChildFixture }) {
    return (
        <div className="acm-childcard">
            <div className="acm-childcard__head">
                <span className="acm-avatar" aria-hidden>{c.name.charAt(0)}</span>
                <span className="acm-row__name">{c.name}</span>
                <span className="acm-pill" data-tone={c.statusTone}>{c.status}</span>
            </div>
            <div className="acm-kv">
                <span><b>DOB / age</b>{c.dobAge}</span>
                <span><b>Program</b>{c.program}</span>
                <span><b>Room</b>{c.room}</span>
                <span><b>Schedule</b>{c.schedule}</span>
                <span><b>Start</b>{c.startDate}</span>
            </div>
            {c.flags?.length ? (
                <div className="acm-flags">
                    {c.flags.map((f) => <span key={f.label} className="acm-flag" data-tone={f.tone}>⚑ {f.label}</span>)}
                </div>
            ) : null}
        </div>
    );
}

function ChildrenCardSection() {
    return (
        <ArchetypeSection
            archetype="Collection"
            cardName="Children Card  ·  priority next implementation"
            question="What is true for this child right now?"
            notes={{
                transition:
                    "Overview lists each child with the at-a-glance answer (name, age, program, status). Evidence expands every child's operational facts inline. Focusing a child is a Change Subject within the same Operational Context family — it establishes the child as the focused subject WITHOUT a new drawer/route; the card swaps to single-child depth. Editing a child's room/schedule happens inline within the focused child, never a card-wide form.",
                performance:
                    "Children + their operational truth (program, room, schedule, status, start date) come from the composed record already loaded in context.truth (_inquiry_children / child projections). Focusing a child re-projects in memory — no fetch. Medical/document flags render only when present.",
            }}
        >
            <StatePanel label="Overview">
                <Card title="Children" icon="🧒" answer="3 children · 2 enrolled, 1 waitlisted" supporting="1 needs attention" badge="3" badgeTone="neutral" rail="work" footer={<MiniAction label="View children →" />}>
                    {CHILDREN_FX.map((c) => <ChildSummaryRow key={c.name} c={c} />)}
                </Card>
            </StatePanel>
            <StatePanel label="Evidence / expanded">
                <Card title="Children" icon="🧒" answer="3 children" supporting="Operational detail per child" rail="work" footer={<MiniAction label="Show less" />}>
                    {CHILDREN_FX.map((c) => <ChildEvidenceRow key={c.name} c={c} />)}
                </Card>
            </StatePanel>
            <StatePanel label="Focused child">
                <Card title="Emma Johnson" icon="🧒" answer="Enrolled · Preschool" supporting="Sunflower room · M–F full day" badge="Enrolled" badgeTone="positive" rail="positive" footer={<><MiniAction label="← All children" /><MiniAction label="Edit schedule" primary /></>}>
                    <div className="acm-kv acm-kv--stack">
                        <span><b>DOB / age</b>Mar 3, 2020 · 6 years</span>
                        <span><b>Program</b>Preschool</span>
                        <span><b>Room</b>Sunflower</span>
                        <span><b>Schedule</b>Monday–Friday · Full day</span>
                        <span><b>Enrollment status</b>Enrolled</span>
                        <span><b>Start date</b>Aug 26, 2025</span>
                    </div>
                    <div className="acm-flags"><span className="acm-flag" data-tone="positive">✓ Immunizations current</span><span className="acm-flag" data-tone="positive">✓ Enrollment form signed</span></div>
                </Card>
            </StatePanel>
            <StatePanel label="Empty">
                <Card title="Children" icon="🧒" answer="No children on this record" supporting="Add a child to begin">
                    <Empty label="No children linked" />
                </Card>
            </StatePanel>
            <StatePanel label="Missing / risk">
                <Card title="Children" icon="🧒" answer="Noah — immunization record missing" supporting="Blocks waitlist → enrolled" badge="Action needed" badgeTone="risk" rail="risk" footer={<MiniAction label="Request record" primary />}>
                    <ChildEvidenceRow c={CHILDREN_FX[2]!} />
                </Card>
            </StatePanel>
            <StatePanel label="Mobile">
                <Card mobile title="Children" icon="🧒" answer="3 children" supporting="2 enrolled · 1 waitlisted" badge="3" badgeTone="neutral" rail="work">
                    {CHILDREN_FX.map((c) => <ChildSummaryRow key={c.name} c={c} />)}
                </Card>
            </StatePanel>
        </ArchetypeSection>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Communication — Communications Card
// ─────────────────────────────────────────────────────────────────────────────

function CommunicationCardSection() {
    return (
        <ArchetypeSection
            archetype="Communication"
            cardName="Communications Card"
            question="What's the latest with this family?"
            notes={{
                transition:
                    "Overview shows the latest exchange + whether a reply is owed. Evidence expands the recent thread. Focusing a message shows its full content; replying opens a compose action (does not leave the Focus Panel).",
                performance:
                    "Recent communications are part of the composed subject payload. The card reads the already-loaded summary; full thread/body is the only deferred fetch, triggered explicitly on focus (never on expand).",
            }}
        >
            <StatePanel label="Overview">
                <Card title="Communications" icon="💬" answer="Email sent 2h ago — awaiting reply" supporting="Last inbound: yesterday" badge="Reply owed" badgeTone="work" rail="work" footer={<MiniAction label="View thread →" />} />
            </StatePanel>
            <StatePanel label="Evidence / expanded">
                <Card title="Communications" icon="💬" answer="3 recent messages" rail="work" footer={<MiniAction label="Show less" />}>
                    <Row lead="↑" name="Enrollment packet sent" detail="Email · 2h ago" trailing="You" tone="work" />
                    <Row lead="↓" name="Re: tour time?" detail="Email · yesterday" trailing="Sarah" />
                    <Row lead="☎" name="Tour reminder call" detail="Call · 3 days ago" trailing="2m" />
                </Card>
            </StatePanel>
            <StatePanel label="Focused message">
                <Card title="Enrollment packet sent" icon="💬" answer="Email · to Sarah Johnson" supporting="2h ago · awaiting reply" footer={<><MiniAction label="← Thread" /><MiniAction label="Reply" primary /></>}>
                    <p className="acm-quote">"Hi Sarah — attached is your enrollment packet for Emma and Liam. Let us know if you have any questions before Friday's tour."</p>
                </Card>
            </StatePanel>
            <StatePanel label="Empty">
                <Card title="Communications" icon="💬" answer="No communications yet" supporting="Start an email or call">
                    <Empty label="No messages on this record" />
                </Card>
            </StatePanel>
            <StatePanel label="Missing / risk">
                <Card title="Communications" icon="💬" answer="No response in 5 days" supporting="Last outbound: Jun 22" badge="Stale" badgeTone="risk" rail="risk" footer={<MiniAction label="Follow up" primary />} />
            </StatePanel>
            <StatePanel label="Mobile">
                <Card mobile title="Communications" icon="💬" answer="Awaiting reply" supporting="Email 2h ago" badge="Reply owed" badgeTone="work" rail="work" />
            </StatePanel>
        </ArchetypeSection>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Financial — Billing Preview Card
// ─────────────────────────────────────────────────────────────────────────────

function FinancialCardSection() {
    return (
        <ArchetypeSection
            archetype="Financial"
            cardName="Billing Preview Card"
            question="What will this family pay, and what's owed?"
            notes={{
                transition:
                    "Overview shows the headline figure (est. monthly + any due balance). Evidence expands the line items. Focusing a line shows its basis; this card previews — it never mutates ledger truth (actions route to billing).",
                performance:
                    "Estimate is derived from the program/schedule already in context.truth + tenant rate config. The card shows a PREVIEW; authoritative balances come from the composed financial summary, not a card write path.",
            }}
        >
            <StatePanel label="Overview">
                <Card title="Billing preview" icon="$" answer="Est. $1,240 / month" supporting="Deposit $250 due at enrollment" badge="Preview" badgeTone="metric" rail="metric" footer={<MiniAction label="View breakdown →" />} />
            </StatePanel>
            <StatePanel label="Evidence / expanded">
                <Card title="Billing preview" icon="$" answer="Est. $1,240 / month" supporting="Before discounts: $1,390" rail="metric" footer={<MiniAction label="Show less" />}>
                    <Row name="Preschool tuition (Emma)" trailing="$890" />
                    <Row name="Toddler tuition (Liam)" trailing="$500" />
                    <Row name="Sibling discount" detail="10%" trailing="−$150" tone="positive" />
                    <Row name="Registration fee" detail="One-time" trailing="$75" />
                </Card>
            </StatePanel>
            <StatePanel label="Focused line">
                <Card title="Preschool tuition" icon="$" answer="$890 / month" supporting="Emma · Full day M–F" footer={<><MiniAction label="← Breakdown" /><MiniAction label="Open in billing" primary /></>}>
                    <Row name="Rate basis" detail="Preschool · Full day" trailing="$890" />
                    <Row name="Effective" detail="From start date" />
                    <Row name="Proration" detail="Not applied" />
                </Card>
            </StatePanel>
            <StatePanel label="Empty">
                <Card title="Billing preview" icon="$" answer="No billing set up" supporting="Assign program + schedule to estimate">
                    <Empty label="Nothing to preview yet" />
                </Card>
            </StatePanel>
            <StatePanel label="Missing / risk">
                <Card title="Billing preview" icon="$" answer="Deposit overdue — $250" supporting="Due Jun 20 · 7 days late" badge="Overdue" badgeTone="risk" rail="risk" footer={<MiniAction label="Send invoice" primary />} />
            </StatePanel>
            <StatePanel label="Mobile">
                <Card mobile title="Billing preview" icon="$" answer="Est. $1,240/mo" supporting="Deposit $250 due" badge="Preview" badgeTone="metric" rail="metric" />
            </StatePanel>
        </ArchetypeSection>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Activity — Timeline Card
// ─────────────────────────────────────────────────────────────────────────────

function ActivityCardSection() {
    return (
        <ArchetypeSection
            archetype="Activity"
            cardName="Timeline Card"
            question="What has happened on this record?"
            notes={{
                transition:
                    "Overview shows the most-recent event. Evidence expands the chronological feed (local; paginates older on demand). Focusing an event shows its detail/actor. Activity is read-only history — no risk/missing variant (shown as N/A).",
                performance:
                    "Recent events are part of the composed payload. Older history loads incrementally on explicit 'show earlier' — never eagerly on expand.",
            }}
        >
            <StatePanel label="Overview">
                <Card title="Timeline" icon="🕘" answer="Tour confirmed — 2h ago" supporting="14 events · last 30 days" rail="neutral" footer={<MiniAction label="View timeline →" />} />
            </StatePanel>
            <StatePanel label="Evidence / expanded">
                <Card title="Timeline" icon="🕘" answer="Recent activity" rail="neutral" footer={<MiniAction label="Show earlier" />}>
                    <Row lead="●" name="Tour confirmed" detail="2h ago · by Sarah" />
                    <Row lead="●" name="Enrollment packet sent" detail="2h ago · workflow" />
                    <Row lead="●" name="Child added: Noah" detail="yesterday · front desk" />
                    <Row lead="●" name="Lead created" detail="Jun 22 · web form" />
                </Card>
            </StatePanel>
            <StatePanel label="Focused event">
                <Card title="Tour confirmed" icon="🕘" answer="2h ago" supporting="By Sarah Johnson" footer={<MiniAction label="← Timeline" />}>
                    <Row name="Channel" detail="Reply to email" />
                    <Row name="Stage" detail="Tour → Confirmed" />
                    <Row name="Recorded" detail="Jun 27, 8:42 AM" />
                </Card>
            </StatePanel>
            <StatePanel label="Empty">
                <Card title="Timeline" icon="🕘" answer="No activity yet" supporting="Events appear as work happens">
                    <Empty label="Nothing recorded" />
                </Card>
            </StatePanel>
            <StatePanel label="Missing / risk (N/A)">
                <Card title="Timeline" icon="🕘" answer="No risk state" supporting="Activity is read-only history">
                    <Empty label="Archetype has no missing/risk variant" />
                </Card>
            </StatePanel>
            <StatePanel label="Mobile">
                <Card mobile title="Timeline" icon="🕘" answer="Tour confirmed" supporting="2h ago" rail="neutral" />
            </StatePanel>
        </ArchetypeSection>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Metrics — KPI / Enrollment Health Card
// ─────────────────────────────────────────────────────────────────────────────

function Kpi({ label, value, tone, delta }: { label: string; value: string; tone?: Tone; delta?: string }) {
    return (
        <div className="acm-kpi" data-tone={tone ?? undefined}>
            <span className="acm-kpi__value">{value}</span>
            <span className="acm-kpi__label">{label}</span>
            {delta ? <span className="acm-kpi__delta">{delta}</span> : null}
        </div>
    );
}

function MetricsCardSection() {
    return (
        <ArchetypeSection
            archetype="Metrics"
            cardName="KPI / Enrollment Health Card"
            question="How healthy is enrollment right now?"
            notes={{
                transition:
                    "Overview shows headline KPIs as tiles. Evidence expands the per-program breakdown. Focusing a KPI shows its trend. This is the one archetype whose subject is a SCOPE (org / program), not a single record — it observes an aggregate context, still read-once.",
                performance:
                    "KPI values come from a precomputed aggregate snapshot in the operational context for the scope. Trends load on focus only. No live recompute inside the card.",
            }}
        >
            <StatePanel label="Overview">
                <Card title="Enrollment health" icon="📊" answer="82% capacity · trending up" supporting="This month" badge="Healthy" badgeTone="positive" rail="positive">
                    <div className="acm-kpis">
                        <Kpi label="Capacity" value="82%" tone="positive" delta="▲ 4" />
                        <Kpi label="Waitlist" value="14" tone="work" />
                        <Kpi label="Conversion" value="38%" tone="metric" delta="▲ 2" />
                    </div>
                </Card>
            </StatePanel>
            <StatePanel label="Evidence / expanded">
                <Card title="Enrollment health" icon="📊" answer="82% capacity" supporting="By program" rail="positive" footer={<MiniAction label="Show less" />}>
                    <Row name="Infant" detail="Capacity" trailing="104%" tone="risk" />
                    <Row name="Toddler" detail="Capacity" trailing="88%" tone="work" />
                    <Row name="Preschool" detail="Capacity" trailing="71%" tone="positive" />
                </Card>
            </StatePanel>
            <StatePanel label="Focused KPI">
                <Card title="Capacity trend" icon="📊" answer="82% · up from 78%" supporting="Last 6 months" footer={<MiniAction label="← KPIs" />}>
                    <div className="acm-spark">
                        {[62, 68, 70, 78, 80, 82].map((v, i) => <span key={i} className="acm-spark__bar" style={{ height: `${v}%` }} />)}
                    </div>
                </Card>
            </StatePanel>
            <StatePanel label="Empty">
                <Card title="Enrollment health" icon="📊" answer="No data for this period" supporting="Adjust range or scope">
                    <Empty label="No metrics available" />
                </Card>
            </StatePanel>
            <StatePanel label="Missing / risk">
                <Card title="Enrollment health" icon="📊" answer="Infant room over capacity" supporting="104% · waitlist growing" badge="Over capacity" badgeTone="risk" rail="risk" footer={<MiniAction label="Review infant room" primary />}>
                    <div className="acm-kpis">
                        <Kpi label="Infant" value="104%" tone="risk" delta="▲ 9" />
                        <Kpi label="Waitlist" value="22" tone="risk" delta="▲ 8" />
                    </div>
                </Card>
            </StatePanel>
            <StatePanel label="Mobile">
                <Card mobile title="Enrollment health" icon="📊" answer="82% capacity" supporting="Trending up" badge="Healthy" badgeTone="positive" rail="positive">
                    <div className="acm-kpis">
                        <Kpi label="Capacity" value="82%" tone="positive" />
                        <Kpi label="Waitlist" value="14" tone="work" />
                    </div>
                </Card>
            </StatePanel>
        </ArchetypeSection>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gallery shell
// ─────────────────────────────────────────────────────────────────────────────

export default function ArchetypeCardMocksGallery() {
    return (
        <div className="acm-root">
            <style>{ACM_CSS}</style>
            <header className="acm-hero">
                <h1>Universal Card Archetype Mocks</h1>
                <p>
                    Reference mocks — one card per archetype. <strong>Not production.</strong> Identity
                    is already implemented as the Household card. Every card answers a single
                    operational question and observes the <em>Operational Context</em> (Queue → Operational
                    Context → Focus Panel → Surface → Cards). Children is the priority next build.
                </p>
                <p className="acm-hero__legend">
                    Neutral chrome · semantic color only as a left rail / badge / warning ·
                    Overview → Evidence → Focused is local UI (no fetch on expand).
                </p>
            </header>

            <ProcessCardSection />
            <WorkCardSection />
            <IntelligenceCardSection />
            <ChildrenCardSection />
            <CommunicationCardSection />
            <FinancialCardSection />
            <ActivityCardSection />
            <MetricsCardSection />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoped styles
// ─────────────────────────────────────────────────────────────────────────────

const ACM_CSS = `
.acm-root { --bg:#f4f6f9; --card:#fff; --ink:#0f172a; --ink2:#475569; --ink3:#94a3b8; --line:#e7ebf0;
  --work:#2563eb; --metric:#7c3aed; --risk:#dc2626; --pos:#16a34a; --warn:#b45309;
  background:var(--bg); color:var(--ink); min-height:100vh; padding:88px clamp(16px,4vw,48px) 64px;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; -webkit-font-smoothing:antialiased; }
.acm-hero { max-width:920px; margin:0 0 32px; }
.acm-hero h1 { font-size:26px; font-weight:700; margin:0 0 10px; letter-spacing:-0.02em; }
.acm-hero p { font-size:14px; line-height:1.6; color:var(--ink2); margin:0 0 8px; }
.acm-hero__legend { font-size:12px; color:var(--ink3); }

.acm-section { margin:0 0 40px; padding:0 0 28px; border-bottom:1px solid var(--line); }
.acm-section__head { margin:0 0 16px; }
.acm-section__titles { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
.acm-section__archetype { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--ink3); }
.acm-section__card { font-size:19px; font-weight:700; margin:0; letter-spacing:-0.01em; }
.acm-section__question { font-size:14px; font-style:italic; color:var(--ink2); margin:6px 0 0; }

.acm-states { display:grid; grid-template-columns:repeat(auto-fill,minmax(248px,1fr)); gap:16px; }
.acm-state { display:flex; flex-direction:column; gap:8px; }
.acm-state__label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink3); }
.acm-state__stage { display:flex; }

.acm-card { position:relative; width:100%; background:var(--card); border:1px solid var(--line); border-radius:12px;
  padding:14px 14px 12px; box-shadow:0 1px 2px rgba(15,23,42,0.04); overflow:hidden; }
.acm-card--mobile { max-width:200px; }
.acm-card[data-rail]::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--ink3); }
.acm-card[data-rail="work"]::before { background:var(--work); }
.acm-card[data-rail="metric"]::before { background:var(--metric); }
.acm-card[data-rail="risk"]::before { background:var(--risk); }
.acm-card[data-rail="positive"]::before { background:var(--pos); }
.acm-card[data-rail="neutral"]::before { background:var(--line); }

.acm-card__head { display:flex; align-items:center; gap:8px; margin:0 0 8px; }
.acm-card__icon { font-size:13px; }
.acm-card__title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink2); flex:1; }
.acm-card__insight { margin:0 0 6px; }
.acm-card__answer { font-size:14px; font-weight:600; line-height:1.35; color:var(--ink); }
.acm-card__supporting { font-size:12px; color:var(--ink2); margin-top:2px; }
.acm-card__body { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
.acm-card__footer { display:flex; gap:8px; margin-top:12px; padding-top:10px; border-top:1px solid var(--line); }

.acm-badge { font-size:10px; font-weight:700; padding:2px 7px; border-radius:999px; white-space:nowrap; }
.acm-badge--neutral { background:#eef1f5; color:var(--ink2); }
.acm-badge--work { background:#e7efff; color:var(--work); }
.acm-badge--metric { background:#f0e9ff; color:var(--metric); }
.acm-badge--risk { background:#fdeaea; color:var(--risk); }
.acm-badge--positive { background:#e6f6ec; color:var(--pos); }

.acm-row { display:flex; align-items:center; gap:9px; }
.acm-row[data-tone="risk"] .acm-row__name { color:var(--risk); }
.acm-row[data-tone="work"] .acm-avatar { background:#e7efff; color:var(--work); }
.acm-row[data-tone="risk"] .acm-avatar { background:#fdeaea; color:var(--risk); }
.acm-row[data-tone="positive"] .acm-avatar { background:#e6f6ec; color:var(--pos); }
.acm-avatar { flex:0 0 auto; width:24px; height:24px; border-radius:50%; background:#eef1f5; color:var(--ink2);
  display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; }
.acm-row__main { display:flex; flex-direction:column; min-width:0; flex:1; }
.acm-row__name { font-size:13px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.acm-row__detail { font-size:11px; color:var(--ink2); }
.acm-row__trailing { font-size:11px; color:var(--ink2); white-space:nowrap; }

.acm-pill { font-size:10px; font-weight:700; padding:2px 7px; border-radius:999px; background:#eef1f5; color:var(--ink2); white-space:nowrap; }
.acm-pill[data-tone="positive"] { background:#e6f6ec; color:var(--pos); }
.acm-pill[data-tone="work"] { background:#e7efff; color:var(--work); }
.acm-pill[data-tone="risk"] { background:#fdeaea; color:var(--risk); }

.acm-action { font-size:11px; font-weight:600; color:var(--ink2); background:#f1f4f7; padding:5px 10px; border-radius:7px; }
.acm-action--primary { color:#fff; background:var(--ink); }

.acm-empty { font-size:12px; color:var(--ink3); font-style:italic; padding:10px; background:#f8fafc; border-radius:8px; text-align:center; }

.acm-notes { margin-top:16px; padding:12px 14px; background:#f8fafc; border:1px solid var(--line); border-radius:10px; }
.acm-notes p { font-size:12px; line-height:1.55; color:var(--ink2); margin:0 0 6px; }
.acm-notes p:last-child { margin:0; }
.acm-notes strong { color:var(--ink); }

/* process steps */
.acm-steps { display:flex; flex-direction:column; gap:7px; }
.acm-step { display:flex; align-items:center; gap:8px; }
.acm-step__dot { width:18px; text-align:center; font-size:11px; color:var(--ink3); }
.acm-step__label { font-size:12px; color:var(--ink2); }
.acm-step[data-state="done"] .acm-step__dot { color:var(--pos); }
.acm-step[data-state="done"] .acm-step__label { color:var(--ink); }
.acm-step[data-state="current"] .acm-step__dot { color:var(--work); }
.acm-step[data-state="current"] .acm-step__label { color:var(--ink); font-weight:600; }

/* gauge */
.acm-gauge { display:flex; align-items:center; gap:8px; }
.acm-gauge__track { flex:1; height:7px; background:#eef1f5; border-radius:999px; overflow:hidden; }
.acm-gauge__fill { height:100%; background:var(--metric); border-radius:999px; }
.acm-gauge[data-tone="risk"] .acm-gauge__fill { background:var(--risk); }
.acm-gauge__value { font-size:12px; font-weight:700; color:var(--ink); }

/* children */
.acm-childcard { border:1px solid var(--line); border-radius:10px; padding:10px; }
.acm-childcard__head { display:flex; align-items:center; gap:8px; margin:0 0 8px; }
.acm-childcard__head .acm-row__name { flex:1; }
.acm-kv { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; }
.acm-kv--stack { grid-template-columns:1fr; }
.acm-kv span { display:flex; flex-direction:column; font-size:12px; color:var(--ink); }
.acm-kv b { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink3); margin-bottom:1px; }
.acm-flags { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.acm-flag { font-size:10px; font-weight:600; padding:2px 7px; border-radius:6px; background:#eef1f5; color:var(--ink2); }
.acm-flag[data-tone="risk"] { background:#fdeaea; color:var(--risk); }
.acm-flag[data-tone="positive"] { background:#e6f6ec; color:var(--pos); }

/* communications */
.acm-quote { font-size:12px; line-height:1.5; color:var(--ink2); margin:0; padding:8px 10px; background:#f8fafc; border-left:2px solid var(--line); border-radius:0 6px 6px 0; }

/* kpis */
.acm-kpis { display:flex; gap:8px; }
.acm-kpi { flex:1; display:flex; flex-direction:column; gap:1px; padding:8px; background:#f8fafc; border-radius:8px; }
.acm-kpi__value { font-size:17px; font-weight:700; color:var(--ink); }
.acm-kpi[data-tone="risk"] .acm-kpi__value { color:var(--risk); }
.acm-kpi[data-tone="positive"] .acm-kpi__value { color:var(--pos); }
.acm-kpi[data-tone="work"] .acm-kpi__value { color:var(--work); }
.acm-kpi[data-tone="metric"] .acm-kpi__value { color:var(--metric); }
.acm-kpi__label { font-size:10px; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink3); }
.acm-kpi__delta { font-size:10px; color:var(--ink2); }
.acm-spark { display:flex; align-items:flex-end; gap:5px; height:48px; }
.acm-spark__bar { flex:1; background:var(--metric); border-radius:3px 3px 0 0; opacity:0.85; }
`;
