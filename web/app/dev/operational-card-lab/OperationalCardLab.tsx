"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

import "@/app/adminV2/components/alloyOsRuntime.css";
import "./cardLab.css";
import "./labShell.css";

import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

import AttendanceCard from "@/components/cardLab/AttendanceCard";
import BillingCard from "@/components/cardLab/BillingCard";
import HealthSafetyCard from "@/components/cardLab/HealthSafetyCard";
import JourneyCard from "@/components/cardLab/JourneyCard";
import StaffCard from "@/components/cardLab/StaffCard";
import {
    ATTENDANCE_FIXTURE,
    BILLING_FIXTURE,
    HEALTH_FIXTURE,
    JOURNEY_FIXTURE,
    LAB_SUBJECT,
    STAFF_FIXTURE,
} from "@/lib/cardLab/cardLabFixtures";

type TabKey = "combined" | "journey" | "health" | "staff" | "attendance" | "billing";

const TABS: { key: TabKey; label: string }[] = [
    { key: "journey", label: "1 · Journey" },
    { key: "health", label: "2 · Health & Safety" },
    { key: "staff", label: "3 · Staff" },
    { key: "attendance", label: "4 · Attendance" },
    { key: "billing", label: "5 · Billing" },
    { key: "combined", label: "6 · Combined Focus Panel" },
];

/** What each candidate answers, and what is still open — review copy, never card chrome. */
const REVIEW: Record<Exclude<TabKey, "combined">, { question: string; decisions: string[]; open: string[] }> = {
    journey: {
        question: "Where did this record start, what has it passed through, and where is it now?",
        decisions: [
            "Spine is the configured Business Process stages. Work Views are operator lenses and are not history.",
            "span: \"row\" — the grid already grants 1023px, so no new width mechanism was added.",
            "One outcome line per stage. Everything deeper is View journey.",
            "Current stage uses the Children --focused tint; progression is carried by connector colour, not a banner.",
        ],
        open: [
            "No durable stage-history store exists, so past entry dates come from events, and a skipped stage can only be inferred.",
            "A Milestones card is registered and permanently empty. Recommendation stands that Journey absorbs it rather than adding a second answer.",
        ],
    },
    health: {
        question: "What do I need to know about this child's health and safety?",
        decisions: [
            "Information card, not an evaluation — no Complete / Needs attention / Severe state taxonomy.",
            "A severe allergy is prominent because the fact is rendered in risk red, not because a count is announced.",
            "Missing required information is amber inside its own section, so it never becomes a second Readiness.",
            "Emergency contacts are Household's truth — shown as a count chip that hands off.",
        ],
        open: [
            "Child health facts have no canonical Alloy store today; category and severity vocabulary needs an owner.",
            "Whether medication authorization is an enrollment requirement or a health fact decides which section owns it.",
        ],
    },
    staff: {
        question: "Who is caring for, or operationally responsible for, this child right now?",
        decisions: [
            "Built from the Household and Children person row — same avatar, name weight, pill slot and label-over-value pair.",
            "Scope is site → program → room → today. Anyone else collapses into one count chip.",
            "The enrollment owner is one more row with its own pill, never a second section.",
        ],
        open: [
            "Which relationships appear should be configuration; there is no relationship-type config surface for staff-to-child yet.",
            "Room assignment for staff is staff_presence truth; the child-to-room link is scheduling truth. One resolver has to join them.",
        ],
    },
    attendance: {
        question: "How is this child's day going, and is it recorded correctly?",
        decisions: [
            "Pure projection of ChildAttendanceReadModel. No second attendance model.",
            "Classroom movement is real: room_transfer is a first-class event kind with from/to room ids.",
            "Corrections are entry_type correction | reversal events, so every path is an action, not an editable field.",
            "Shares the progression band with Journey — one new primitive, used twice.",
        ],
        open: [
            "Child attendance has no registered capability (staff has staff_presence.*), so these actions have no action key to call yet.",
            "Expected-hours truth comes from ExpectedAttendanceEntry; the card assumes one contiguous window per day.",
        ],
    },
    billing: {
        question: "Where does this family stand financially right now?",
        decisions: [
            "Three zones across one grid row, separated only by the gap — the family has no vertical rules.",
            "Payer identity is its own evidence; household primary contact is not assumed to be a payer.",
            "Emphasis follows state: Pay now while past due, otherwise Manage payment.",
            "Recent activity is a preview capped at five, matching Timeline's SUMMARY_MAX rule.",
        ],
        open: [
            "Alloy has a charge substrate but no family-grain posted balance, billing period, autopay or payment-method health.",
            "Subsidy and responsibility split have no canonical model — the payer rows are the shape a model would need to fill.",
        ],
    },
};

export default function OperationalCardLab() {
    const [tab, setTab] = useState<TabKey>("journey");

    const { vm, record } = useMemo(() => buildDemoFocusPanelSummaryViewModel(), []);
    const realCards = useMemo(
        () =>
            deriveOpportunityFocusPanelPresentation({
                mode: "summary",
                displayVm: vm,
                record,
                title: vm.header.title,
                perspective: null,
                statusLabel: "Enrolling",
            }).cards,
        [vm, record],
    );
    const context = useMemo(
        () =>
            buildOperationalContext({
                subjectId: String(vm.entity.id),
                title: vm.header.title,
                subjectVm: vm,
                truth: record,
                perspective: null,
                statusLabel: "Enrolling",
                canMutate: false,
            }),
        [vm, record],
    );

    const realCard = (key: FocusPanelCardKey) => {
        const model = realCards.get(key);
        if (!model) return null;
        return (
            <FocusPanelCardRenderer
                model={model}
                context={context}
                focusPanelMode="summary"
                compat={{ onSelectTab: () => {} }}
            />
        );
    };

    const journey = <JourneyCard evidence={JOURNEY_FIXTURE} />;
    const health = <HealthSafetyCard evidence={HEALTH_FIXTURE} />;
    const staff = <StaffCard evidence={STAFF_FIXTURE} />;
    const attendance = <AttendanceCard evidence={ATTENDANCE_FIXTURE} />;
    const billing = <BillingCard evidence={BILLING_FIXTURE} />;

    return (
        <div className="lab">
            <header className="lab__head">
                <p className="lab__eyebrow">Local Design Lab · candidate operational cards</p>
                <h1 className="lab__title">Five candidates, in the real card family</h1>
                <p className="lab__lede">
                    Rendered through the real <code>UniversalCard</code> shell, the real{" "}
                    <code>alloyOsRuntime.css</code>, and the real Focus Panel grid, beside the real Household,
                    Children, Readiness and Current Work cards. Nothing here is registered in{" "}
                    <code>FOCUS_PANEL_CARD_KEYS</code>, <code>FOCUS_PANEL_CARDS</code>, the Surfaces catalog,{" "}
                    <code>SYSTEM5_CARD_ARCHETYPE</code> or <code>focusPanelCardProviders</code>, so no candidate can
                    reach a Surface. Visual approval here is not production approval.
                </p>
                <p className="lab__fixture">
                    <strong>Fixture data.</strong> Subject is {LAB_SUBJECT.child} of the {LAB_SUBJECT.household},{" "}
                    {LAB_SUBJECT.program} program, {LAB_SUBJECT.room}, {LAB_SUBJECT.site} — taken from the platform&apos;s
                    own <code>buildDemoFocusPanelSummaryViewModel()</code> so the real cards and the candidates
                    describe one family. Amounts, health facts, staff and attendance events are specimen values and
                    are not read from any record.
                </p>
            </header>

            <nav className="lab__tabs" aria-label="Candidate cards">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        className={clsx("lab__tab", tab === t.key && "lab__tab--on")}
                        onClick={() => setTab(t.key)}
                        aria-current={tab === t.key}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>

            {tab === "combined" ? (
                <>
                    <section className="lab__section">
                        <h2 className="lab__h2">Realistic Focus Panel composition</h2>
                        <p className="lab__note">
                            Real cards are marked <span className="lab__chip lab__chip--real">runtime</span>, candidates{" "}
                            <span className="lab__chip lab__chip--cand">candidate</span>. Same grid, same widths, same
                            density as the published surface: two columns, 10px gap, cards at their natural height.
                        </p>
                    </section>
                    <div className="lab__frame">
                        <div className="lab__frame-label">Focus Panel · Summary · 1055px</div>
                        <div
                            className="alloy-os-focus-panel-grid lab__grid"
                            style={{ ["--alloy-os-fp-cols" as string]: 2 }}
                        >
                            <Cell span={2} kind="cand" name="Journey">{journey}</Cell>
                            <Cell span={1} kind="real" name="What's Next">{realCard("current_work")}</Cell>
                            <Cell span={1} kind="real" name="Household">{realCard("household")}</Cell>
                            <Cell span={2} kind="cand" name="Attendance">{attendance}</Cell>
                            <Cell span={1} kind="real" name="Children">{realCard("children")}</Cell>
                            <Cell span={1} kind="cand" name="Staff">{staff}</Cell>
                            <Cell span={1} kind="cand" name="Health & Safety">{health}</Cell>
                            <Cell span={1} kind="real" name="Readiness">{realCard("readiness_kpi")}</Cell>
                            <Cell span={2} kind="cand" name="Billing">{billing}</Cell>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <section className="lab__section">
                        <h2 className="lab__h2">{REVIEW[tab].question}</h2>
                    </section>
                    <div className="lab__split">
                        <div className="lab__frame">
                            <div className="lab__frame-label">
                                Focus Panel · Summary · 1055px
                                {tab === "journey" || tab === "attendance" || tab === "billing"
                                    ? " · full row"
                                    : " · one column"}
                            </div>
                            <div
                            className="alloy-os-focus-panel-grid lab__grid"
                            style={{ ["--alloy-os-fp-cols" as string]: 2 }}
                        >
                                {tab === "journey" ? <Cell span={2} kind="cand" name="Journey">{journey}</Cell> : null}
                                {tab === "attendance" ? (
                                    <Cell span={2} kind="cand" name="Attendance">{attendance}</Cell>
                                ) : null}
                                {tab === "billing" ? <Cell span={2} kind="cand" name="Billing">{billing}</Cell> : null}
                                {tab === "health" ? (
                                    <>
                                        <Cell span={1} kind="cand" name="Health & Safety">{health}</Cell>
                                        <Cell span={1} kind="real" name="Household">{realCard("household")}</Cell>
                                    </>
                                ) : null}
                                {tab === "staff" ? (
                                    <>
                                        <Cell span={1} kind="cand" name="Staff">{staff}</Cell>
                                        <Cell span={1} kind="real" name="Household">{realCard("household")}</Cell>
                                    </>
                                ) : null}
                            </div>
                        </div>
                        <aside className="lab__review">
                            <p className="lab__review-head">Design decisions</p>
                            <ul className="lab__list">
                                {REVIEW[tab].decisions.map((d) => (
                                    <li key={d}>{d}</li>
                                ))}
                            </ul>
                            <p className="lab__review-head">Open — data source or configuration</p>
                            <ul className="lab__list lab__list--open">
                                {REVIEW[tab].open.map((d) => (
                                    <li key={d}>{d}</li>
                                ))}
                            </ul>
                        </aside>
                    </div>
                </>
            )}
        </div>
    );
}

/** Grid cell mirroring the runtime's, plus a review tag rendered OUTSIDE the card. */
function Cell({
    span,
    kind,
    name,
    children,
}: {
    span: 1 | 2;
    kind: "real" | "cand";
    name: string;
    children: React.ReactNode;
}) {
    if (!children) return null;
    return (
        <div className="alloy-os-focus-panel-grid__cell lab__cell" style={{ gridColumn: `span ${span}` }}>
            <span className={clsx("lab__cell-tag", kind === "real" ? "lab__cell-tag--real" : "lab__cell-tag--cand")}>
                {name} · {kind === "real" ? "runtime" : "candidate"}
            </span>
            {children}
        </div>
    );
}
