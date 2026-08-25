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
import CareTeamCard from "@/components/cardLab/CareTeamCard";
import HealthSafetyCard from "@/components/cardLab/HealthSafetyCard";
import JourneyCard from "@/components/cardLab/JourneyCard";
import StaffCard from "@/components/cardLab/StaffCard";
import {
    ATTENDANCE_FIXTURE,
    ATTENDANCE_OVERFLOW_SPECIMENS,
    attendanceWithMovements,
    BILLING_FIXTURE,
    BILLING_SPECIMENS,
    CARE_TEAM_FIXTURE,
    HEALTH_FIXTURE,
    HEALTH_SPECIMENS,
    JOURNEY_FIXTURE,
    LAB_SUBJECT,
    STAFF_FIXTURE,
} from "@/lib/cardLab/cardLabFixtures";

type TabKey =
    | "combined"
    | "journey"
    | "health"
    | "staff"
    | "careteam"
    | "attendance"
    | "overflow"
    | "billing"
    | "healthspec"
    | "billingspec"
    | "wide"
    | "billingab";

const TABS: { key: TabKey; label: string }[] = [
    { key: "journey", label: "1 · Journey" },
    { key: "health", label: "2 · Health & Safety" },
    { key: "staff", label: "3 · Staff" },
    { key: "careteam", label: "3b · Care Team" },
    { key: "attendance", label: "4 · Attendance" },
    { key: "overflow", label: "4b · Movement overflow" },
    { key: "billing", label: "5 · Billing" },
    { key: "healthspec", label: "A · Health specimens" },
    { key: "billingab", label: "B1 · Billing A/B" },
    { key: "billingspec", label: "B · Billing specimens" },
    { key: "wide", label: "C · Wide cards together" },
    { key: "combined", label: "6 · Combined Focus Panel" },
];

/** What each candidate answers, and what is still open — review copy, never card chrome. */
const REVIEW: Record<Exclude<TabKey, "combined">, { question: string; decisions: string[]; open: string[] }> = {
    journey: {
        question: "Where did this record start, what has it passed through, and where is it now?",
        decisions: [
            "Orientation strip, not a report. One summary line in the header instead of two, and one folded supporting line per stage.",
            "Spine is the configured Business Process stages. Work Views are operator lenses and are not history.",
            "Progression is carried by connector colour; the current stage takes the Children --focused tint.",
            "Everything deeper — skipped, revisited and reopened stages, and the events behind each outcome — is View journey.",
        ],
        open: [
            "No durable stage-history store exists, so past entry dates come from events and a skipped stage can only be inferred.",
            "A Milestones card is registered and permanently empty. Recommendation stands that Journey absorbs it.",
        ],
    },
    healthspec: {
        question: "Does the hierarchy hold for a typical, a higher-care and a complex child?",
        decisions: [
            "Three densities, not a state matrix: typical, higher-care, complex.",
            "C exists to prove the compact hierarchy does not collapse when a child has significant medical needs — two critical facts, three ongoing needs, four medications.",
            "With no critical facts (A) the region does not render at all, and nothing says \"No alerts\" — the header carries the care line instead.",
        ],
        open: [
            "A child with more than three critical facts is not represented here; the region would need its own cap and a View all.",
        ],
    },
    billingspec: {
        question: "Does the composition survive realistic financial complexity?",
        decisions: [
            "Three situations: current with nothing overdue, past due with a failed payment, and mixed funding with subsidy, discount and credit.",
            "In the current case Past Due states \"Nothing past due\" calmly rather than disappearing, so the three zones keep their shape.",
            "Mixed funding pushes the arithmetic to five lines and the payer strip to three payers — the strip absorbs it because it runs full width.",
        ],
        open: [
            "A family with more than four payers would overflow the strip; a count-and-collapse rule would be needed, as Attendance has for movements.",
        ],
    },
    billingab: {
        question: "Should the third zone be Recent Ledger, or Payment?",
        decisions: [
            "Rendered both ways from the same evidence rather than assuming — A keeps the mini ledger, B answers how the bill is expected to be paid and steps the ledger down to one line.",
            "In B the payers live in the Payment zone where they belong, and the payer strip disappears.",
            "A funding source is drawn as a funding source, not as an ordinary parent payer.",
            "Recommendation is in the review doc: A ships now, because every field it renders has a canonical owner today and half of B's does not.",
        ],
        open: [
            "Autopay state and next scheduled charge have NO owner in Alloy — no table, no column. B renders them as fixture only.",
            "customer_payment_methods is scoped to the household, not to a payer, so \"Jordan · Visa 4242\" cannot be built today.",
            "Responsibility split has no field: billing_responsibility is a composition group with defaultFieldKeys: [].",
        ],
    },
    wide: {
        question: "Do the three wide cards read as one system rather than three custom mini-apps?",
        decisions: [
            "Journey, Attendance and Billing all sit at span \"row\" — 1023px — and all three use the same header grammar, the same section-head grammar, and the same action treatment.",
            "Journey and Attendance share the progression band; Billing does not, because its content is arithmetic rather than a sequence.",
            "Colour is state in all three: bend-pine for what has happened or been paid, amber for what is late or missing, red reserved for safety.",
        ],
        open: [
            "Billing is the only wide card with an internal column structure. If a fourth wide card wants zones, that structure should be promoted to a shared primitive rather than copied.",
        ],
    },
    health: {
        question: "What health and safety information do I need to know about this child?",
        decisions: [
            "Critical is a CONTAINED region — the Children --focused treatment in the risk tone, not a banner. Multiple critical facts stack inside the one region so two facts never become two alerts.",
            "With no critical facts the region does not render, and nothing says \"No alerts\".",
            "Medication nests UNDER the need it supports, because that is how an operator understands it. A medication with no associated need still appears on its own. Canonical ownership stays separate underneath.",
            "The header states no summary when a critical region exists — announcing the same fact twice weakens both.",
            "Enrollment health is requirement satisfaction, not a health fact: two compact columns so it never dominates the care information.",
            "Emergency contacts are relationship truth — one quiet projected line, and Household owns them.",
        ],
        open: [
            "Health today is TWO fields in systemFieldRegistry — allergy_notes (textarea) and medication_flag (checkbox) — both entity_type \"enrollment\", not child. Severity, reaction, treatment and medication records have no owner.",
            "Repeatable structured facts are already expressible (form group.repeat + collection_binding) but no canonical health collection provider exists — only \"children\" is bound today.",
            "requirement kind \"document\" is declared but NOT authorable: document evidence is bound to a form submission, so a document required outside a form has no owner that can prove it.",
        ],
    },
    staff: {
        question: "Who is this employee, what is their role, where are they assigned, and what matters right now?",
        decisions: [
            "Employee-grain — the subject is the staff person. Care Team is its child-grain relative; they are different questions, not variants.",
            "A direct sibling of Household and Children: identity row, label-over-value fact grids, chips for assignments, one state pill.",
            "Employment carries PersonEmploymentComposition.current verbatim, in the order the existing Employment card already uses.",
            "Today reads staff_presence_events; assignments read schedule_assignments with subject_type = 'staff'.",
        ],
        open: [
            "NO qualifications or credentials are rendered. No credential, certification or training store exists anywhere in Alloy — the only credential table is org_provider_credential_authority, which is communications Vault refs. Rendering CPR / First Aid would be inventing employment truth.",
            "staff_presence has no room_transfer kind by design, so a staff member's room changes within a day are not observable — only the room their latest presence fact asserts.",
        ],
    },
    careteam: {
        question: "Who is caring for, or operationally responsible for, this child right now?",
        decisions: [
            "PRESERVED and reclassified from the previous pass. Child-grain, and explicitly not the Staff card.",
            "Built from the Household and Children person row — same avatar, name weight, pill slot and label-over-value pair.",
            "Scope is the child's site, program, room and today. The enrollment owner is one more row with its own pill and its own labels.",
        ],
        open: [
            "Which relationships appear should be configuration; there is no staff-to-child relationship config surface yet.",
            "Staff room assignment is staff_presence truth while the child-to-room link is scheduling truth — one resolver has to join them.",
        ],
    },
    attendance: {
        question: "How is this child's day going, and is it recorded correctly?",
        decisions: [
            "Pure projection of ChildAttendanceReadModel. No second attendance model.",
            "room_transfer is a first-class event kind with from/to room ids, so classroom movement is real truth.",
            "Corrections are entry_type correction | reversal events, so every path is an action, never an editable field.",
            "Shares the progression band with Journey — one new primitive, used twice.",
        ],
        open: [
            "Child attendance has no registered capability (staff has staff_presence.*), so these actions have no action key to call yet.",
        ],
    },
    overflow: {
        question: "What happens when a child has more movements than the card can reasonably show?",
        decisions: [
            "A bounded PROJECTION, not a data rule — the record keeps every movement. Six columns maximum, whatever the day did.",
            "Kept in priority order: check-in, earliest movement, collapsed count, the two most recent movements, current location, check-out.",
            "The collapsed count is an affordance, not an event — dashed outline, no glyph fill — and opens View day.",
            "The card never widens, never shrinks its type, and never grows taller as the day gets busier.",
        ],
        open: [
            "Whether the earliest movement is worth a column when it repeats the check-in room is a judgement the evidence builder should make, not the card.",
        ],
    },
    billing: {
        question: "Where does this family stand financially right now?",
        decisions: [
            "The header states NO money. A summary there duplicated every number below it; if an amount is past due, the Past Due zone is already the loudest thing on the card.",
            "Three zones, bounded by a 34px gap and aligned grammar rather than vertical rules.",
            "Payers moved OUT of the arithmetic into a full-width strip below the zones — as three stacked rows under Current Billing they made zone one three times the height of the others.",
            "Recent Ledger is a ledger: fixed column grid with a quiet Date / Description / Amount heading, uniform 20px rows, tabular figures, right-aligned amounts, no pills.",
            "Direction is account balance — a charge or fee INCREASES what is owed (+), a payment, credit, discount or subsidy REDUCES it (−). The sign carries the meaning; colour only reinforces it.",
            "Action hierarchy: Pay now filled inside Past Due because it is contextual and primary; every other financial action in one quiet footer row.",
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
    const careTeam = <CareTeamCard evidence={CARE_TEAM_FIXTURE} />;
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
                            <Cell span={1} kind="cand" name="Care Team">{careTeam}</Cell>
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
                                {tab === "journey" ||
                                tab === "attendance" ||
                                tab === "billing" ||
                                tab === "overflow" ||
                                tab === "billingspec" ||
                                tab === "billingab" ||
                                tab === "wide"
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
                                        <Cell span={1} kind="real" name="Children">{realCard("children")}</Cell>
                                    </>
                                ) : null}
                                {tab === "healthspec" ? (
                                    <>
                                        {HEALTH_SPECIMENS.map((sp) => (
                                            <Cell key={sp.caseLabel} span={1} kind="cand" name={sp.caseLabel}>
                                                <HealthSafetyCard evidence={sp} />
                                            </Cell>
                                        ))}
                                        <Cell span={1} kind="real" name="Household">{realCard("household")}</Cell>
                                    </>
                                ) : null}
                                {tab === "billingspec" ? (
                                    <>
                                        {BILLING_SPECIMENS.map((sp) => (
                                            <Cell key={sp.caseLabel} span={2} kind="cand" name={sp.caseLabel}>
                                                <BillingCard evidence={sp} />
                                            </Cell>
                                        ))}
                                    </>
                                ) : null}
                                {tab === "billingab" ? (
                                    <>
                                        <Cell span={2} kind="cand" name="A · Current | Past due | Recent ledger">
                                            <BillingCard evidence={BILLING_FIXTURE} variant="ledger" />
                                        </Cell>
                                        <Cell span={2} kind="cand" name="B · Current | Past due | Payment">
                                            <BillingCard evidence={BILLING_FIXTURE} variant="payment" />
                                        </Cell>
                                    </>
                                ) : null}
                                {tab === "wide" ? (
                                    <>
                                        <Cell span={2} kind="cand" name="Journey">{journey}</Cell>
                                        <Cell span={2} kind="cand" name="Attendance">{attendance}</Cell>
                                        <Cell span={2} kind="cand" name="Billing">{billing}</Cell>
                                    </>
                                ) : null}
                                {tab === "staff" ? (
                                    <>
                                        <Cell span={1} kind="cand" name="Staff">{staff}</Cell>
                                        <Cell span={1} kind="real" name="Household">{realCard("household")}</Cell>
                                    </>
                                ) : null}
                                {tab === "careteam" ? (
                                    <>
                                        <Cell span={1} kind="cand" name="Care Team">{careTeam}</Cell>
                                        <Cell span={1} kind="real" name="Children">{realCard("children")}</Cell>
                                    </>
                                ) : null}
                                {tab === "overflow" ? (
                                    <>
                                        {ATTENDANCE_OVERFLOW_SPECIMENS.map((n) => (
                                            <Cell
                                                key={n}
                                                span={2}
                                                kind="cand"
                                                name={`Attendance · ${n} movements`}
                                            >
                                                <AttendanceCard evidence={attendanceWithMovements(n)} />
                                            </Cell>
                                        ))}
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
