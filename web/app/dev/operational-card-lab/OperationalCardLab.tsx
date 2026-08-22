"use client";

import "@/app/adminV2/components/alloyOsRuntime.css";

import { useState } from "react";

import JourneyCard from "@/components/cardLab/JourneyCard";
import HealthSafetyCard from "@/components/cardLab/HealthSafetyCard";
import StaffCard from "@/components/cardLab/StaffCard";
import AttendanceCard from "@/components/cardLab/AttendanceCard";
import BillingCard from "@/components/cardLab/BillingCard";
import {
    ATTENDANCE_SPECIMENS,
    ATTENDANCE_STAFF_VARIANT,
    BILLING_SPECIMENS,
    HEALTH_SPECIMENS,
    JOURNEY_MULTI_CHILD,
    JOURNEY_SPECIMENS,
    STAFF_SPECIMENS,
} from "@/lib/cardLab/cardLabFixtures";

type CardTab = "journey" | "health" | "staff" | "attendance" | "billing" | "panel";

const TABS: { key: CardTab; label: string; question: string }[] = [
    { key: "journey", label: "Journey", question: "Where is this subject in its process, how did it get here, and what remains?" },
    { key: "health", label: "Health & Safety", question: "What health and safety information matters, and what is incomplete?" },
    { key: "staff", label: "Staff", question: "Which staff are relevant to this subject, in what role, under what assignment?" },
    { key: "attendance", label: "Attendance", question: "What was expected, what happened, what is happening now, what needs correction?" },
    { key: "billing", label: "Billing", question: "What is owed, what period, how is payment configured, what recently happened?" },
    { key: "panel", label: "Panel density", question: "All five together — is any card too dense for a shared Focus Panel?" },
];

function Specimen({
    name,
    note,
    children,
    width = 420,
}: {
    name: string;
    note?: string;
    children: React.ReactNode;
    width?: number;
}) {
    return (
        <div data-specimen={name} style={{ width, maxWidth: "100%" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0f172a", letterSpacing: 0.2 }}>{name}</span>
            </div>
            {note ? (
                <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px", lineHeight: 1.5 }}>{note}</p>
            ) : null}
            {children}
        </div>
    );
}

function Grid({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "flex-start" }}>{children}</div>
    );
}

export default function OperationalCardLab() {
    const [tab, setTab] = useState<CardTab>("journey");
    const [expanded, setExpanded] = useState(false);
    const active = TABS.find((t) => t.key === tab)!;

    return (
        <div style={{ background: "#f4f6f9", minHeight: "100vh", padding: "20px 24px 64px" }}>
            <header style={{ marginBottom: 18, maxWidth: 1180 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#0f172a" }}>
                    Operational Card System Expansion — Local Design Lab
                </h1>
                <p style={{ fontSize: 12, color: "#475569", margin: "6px 0 0", lineHeight: 1.6 }}>
                    Five specified cards rendered through the real <code>UniversalCard</code> shell and{" "}
                    <code>alloyOsRuntime.css</code>, from fixture evidence. <strong>Specification only.</strong>{" "}
                    None of these cards is registered in <code>FOCUS_PANEL_CARD_KEYS</code>,{" "}
                    <code>FOCUS_PANEL_CARDS</code>, the Surfaces catalog, or any composition — so none can
                    reach a production surface. Visual approval is not production approval.
                </p>
                <p style={{ fontSize: 11, color: "#64748b", margin: "8px 0 0", lineHeight: 1.6 }}>
                    Tinted notes are review affordances, not card chrome. <strong style={{ color: "#991b1b" }}>NO OWNER</strong>{" "}
                    = the fact has no canonical owner in Alloy and is rendered nowhere.{" "}
                    <strong style={{ color: "#92400e" }}>HELD</strong> = specified but no source has answered.{" "}
                    <strong style={{ color: "#475569" }}>UNRESOLVED</strong> = the projection has not loaded; in
                    production the card occupies no slot.
                </p>
            </header>

            <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        data-lab-tab={t.key}
                        style={{
                            appearance: "none",
                            border: `1px solid ${tab === t.key ? "#0f172a" : "#e2e8f0"}`,
                            background: tab === t.key ? "#0f172a" : "#fff",
                            color: tab === t.key ? "#fff" : "#334155",
                            borderRadius: 8,
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        {t.label}
                    </button>
                ))}
                <label
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginLeft: 12,
                        fontSize: 12,
                        color: "#334155",
                        fontWeight: 600,
                    }}
                >
                    <input
                        type="checkbox"
                        checked={expanded}
                        onChange={(e) => setExpanded(e.target.checked)}
                        data-lab-expanded="true"
                    />
                    Expanded
                </label>
            </nav>

            <p style={{ fontSize: 12, color: "#0f172a", margin: "0 0 20px", fontWeight: 600 }}>{active.question}</p>

            {tab === "journey" ? (
                <>
                    <Grid>
                        <Specimen name="Early stage" note="Lead. Requirement count from the pinned revision's stage.">
                            <JourneyCard evidence={JOURNEY_SPECIMENS.early} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Mid-process" note="Tour, with a durable outcome anchored to the stage.">
                            <JourneyCard evidence={JOURNEY_SPECIMENS.midProcess} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Waitlist" note="Position at entry is NOT shown — ranking is recomputed and never stored.">
                            <JourneyCard evidence={JOURNEY_SPECIMENS.waitlist} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Enrolling (current)" note="The reference case from the brief.">
                            <JourneyCard evidence={JOURNEY_SPECIMENS.enrolling} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Completed" note="Every stage passed; no open work to hand off.">
                            <JourneyCard evidence={JOURNEY_SPECIMENS.completed} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Skipped step" note="Waitlist was passed with no anchored fact. Status is INFERRED and says so.">
                            <JourneyCard evidence={JOURNEY_SPECIMENS.skipped} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Reopened step" note="Claimed only from an observed backwards transition in mutation_events.">
                            <JourneyCard evidence={JOURNEY_SPECIMENS.reopened} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Closed / lost" note="process_instances.state + close_reason_key.">
                            <JourneyCard evidence={JOURNEY_SPECIMENS.closed} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Unresolved" note="No governing revision resolved. Holds; in production occupies no slot.">
                            <JourneyCard evidence={JOURNEY_SPECIMENS.unresolved} expanded={expanded} />
                        </Specimen>
                    </Grid>
                    <h2 style={{ fontSize: 13, fontWeight: 700, margin: "32px 0 6px", color: "#0f172a" }}>
                        Multi-child family — one rail per child
                    </h2>
                    <p style={{ fontSize: 11.5, color: "#64748b", margin: "0 0 14px", maxWidth: 760, lineHeight: 1.6 }}>
                        A <code>process_instance</code> is (process, subject, context). For Enrollment the subject is
                        the CHILD, so a family of three has three journeys at different positions. Merging them into
                        one rail would invent a family-grain position the platform does not store.
                    </p>
                    <Grid>
                        {JOURNEY_MULTI_CHILD.map((row) => (
                            <Specimen key={row.childName} name={row.childName}>
                                <JourneyCard evidence={row.evidence} expanded={expanded} />
                            </Specimen>
                        ))}
                    </Grid>
                </>
            ) : null}

            {tab === "health" ? (
                <Grid>
                    <Specimen name="Complete" note="All configured requirements met.">
                        <HealthSafetyCard evidence={HEALTH_SPECIMENS.complete} expanded={expanded} />
                    </Specimen>
                    <Specimen name="Needs attention" note="Two resolved-and-unmet requirements. Only resolved items count.">
                        <HealthSafetyCard evidence={HEALTH_SPECIMENS.needsAttention} expanded={expanded} />
                    </Specimen>
                    <Specimen name="Severe safety alert" note="Prominence is CONFIGURED on the field, never inferred from the text.">
                        <HealthSafetyCard evidence={HEALTH_SPECIMENS.severeAlert} expanded={expanded} />
                    </Specimen>
                    <Specimen name="New / empty" note='Reads "No health information recorded" — never "No known allergies".'>
                        <HealthSafetyCard evidence={HEALTH_SPECIMENS.empty} expanded={expanded} />
                    </Specimen>
                    <Specimen name="Held requirements" note="Two requirements unresolved. Not counted; no blocked verdict.">
                        <HealthSafetyCard evidence={HEALTH_SPECIMENS.heldRequirements} expanded={expanded} />
                    </Specimen>
                    <Specimen name="Unresolved" note="The field projection has not answered.">
                        <HealthSafetyCard evidence={HEALTH_SPECIMENS.unresolved} expanded={expanded} />
                    </Specimen>
                </Grid>
            ) : null}

            {tab === "staff" ? (
                <Grid>
                    <Specimen name="One assigned" note="Primary room assignment + covering employment position.">
                        <StaffCard evidence={STAFF_SPECIMENS.one} expanded={expanded} />
                    </Specimen>
                    <Specimen name="Several roles" note="Configured groups: primary, other assigned, leadership, process owner.">
                        <StaffCard evidence={STAFF_SPECIMENS.severalRoles} expanded={expanded} />
                    </Specimen>
                    <Specimen name="Nobody assigned" note="Resolved and genuinely empty — an operationally loud answer.">
                        <StaffCard evidence={STAFF_SPECIMENS.none} expanded={expanded} />
                    </Specimen>
                    <Specimen name="Unresolved" note="The distinction that matters most on this card.">
                        <StaffCard evidence={STAFF_SPECIMENS.unresolved} expanded={expanded} />
                    </Specimen>
                </Grid>
            ) : null}

            {tab === "attendance" ? (
                <>
                    <Grid>
                        <Specimen name="Currently present" note="Check-in recorded, no check-out yet.">
                            <AttendanceCard evidence={ATTENDANCE_SPECIMENS.present} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Not arrived" note="Expected today, no presence or absence fact.">
                            <AttendanceCard evidence={ATTENDANCE_SPECIMENS.notArrived} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Completed day" note="Both facts recorded.">
                            <AttendanceCard evidence={ATTENDANCE_SPECIMENS.completedDay} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Absent" note="Reason from the controlled vocabulary. No billing meaning.">
                            <AttendanceCard evidence={ATTENDANCE_SPECIMENS.absent} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Missing checkout" note="Presence with no check_out — the fold detects it.">
                            <AttendanceCard evidence={ATTENDANCE_SPECIMENS.missingCheckout} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Corrected record" note="An append-only correction must be VISIBLE, or the table's design is wasted.">
                            <AttendanceCard evidence={ATTENDANCE_SPECIMENS.corrected} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Closed day" note="From childcare_operating_windows.">
                            <AttendanceCard evidence={ATTENDANCE_SPECIMENS.closedDay} expanded={expanded} />
                        </Specimen>
                        <Specimen name="No configured window" note="The pattern sets no default hours — the window is omitted, never substituted with site hours.">
                            <AttendanceCard evidence={ATTENDANCE_SPECIMENS.noConfiguredWindow} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Unresolved" note="An empty day and an unloaded day are different facts.">
                            <AttendanceCard evidence={ATTENDANCE_SPECIMENS.unresolved} expanded={expanded} />
                        </Specimen>
                    </Grid>
                    <h2 style={{ fontSize: 13, fontWeight: 700, margin: "32px 0 6px", color: "#0f172a" }}>
                        Staff variant — same blueprint, different fact source
                    </h2>
                    <p style={{ fontSize: 11.5, color: "#64748b", margin: "0 0 14px", maxWidth: 760, lineHeight: 1.6 }}>
                        <code>staff_presence_events</code> has the same columns and the same
                        entry_type/corrects_event_id correction model. Note that the mutating actions are ENABLED
                        here: staff has <code>staff_presence.record</code> and <code>staff_presence.correct</code>{" "}
                        registered. Children have neither (GAP-2).
                    </p>
                    <Grid>
                        <Specimen name="Staff presence" note="Actions available — registered capabilities exist.">
                            <AttendanceCard evidence={ATTENDANCE_STAFF_VARIANT} expanded={expanded} />
                        </Specimen>
                    </Grid>
                </>
            ) : null}

            {tab === "billing" ? (
                <>
                    <Grid>
                        <Specimen name="Setup incomplete" note="Both readiness items resolved and unmet.">
                            <BillingCard evidence={BILLING_SPECIMENS.setupIncomplete} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Configured / current" note="Contact + tuition resolved; posted charges as activity.">
                            <BillingCard evidence={BILLING_SPECIMENS.configured} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Balance due" note="Balance ONLY from feeBalanceCents. A preview row is marked as recomputable.">
                            <BillingCard evidence={BILLING_SPECIMENS.balanceDue} expanded={expanded} />
                        </Specimen>
                        <Specimen name="Unresolved" note='The state that must not print "1 item missing".'>
                            <BillingCard evidence={BILLING_SPECIMENS.unresolved} expanded={expanded} />
                        </Specimen>
                    </Grid>
                    <h2 style={{ fontSize: 13, fontWeight: 700, margin: "32px 0 6px", color: "#0f172a" }}>
                        The financial-state shape — specified, held, no owner
                    </h2>
                    <p style={{ fontSize: 11.5, color: "#64748b", margin: "0 0 14px", maxWidth: 760, lineHeight: 1.6 }}>
                        Shown so the target design can be reviewed now and wired later as a producer change with no
                        card change. Every row is null in every production path today.
                    </p>
                    <Grid>
                        <Specimen name="Held financial state" width={460}>
                            <BillingCard evidence={BILLING_SPECIMENS.configured} expanded showHeldShape />
                        </Specimen>
                    </Grid>
                </>
            ) : null}

            {tab === "panel" ? (
                <>
                    <p style={{ fontSize: 11.5, color: "#64748b", margin: "0 0 14px", maxWidth: 760, lineHeight: 1.6 }}>
                        The Focus Panel will hold several of these at once. This is the density check: each card
                        must answer in one line and hold its detail behind expansion.
                    </p>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                            gap: 14,
                            maxWidth: 1120,
                        }}
                        data-lab-panel="true"
                    >
                        <JourneyCard evidence={JOURNEY_SPECIMENS.enrolling} expanded={expanded} />
                        <HealthSafetyCard evidence={HEALTH_SPECIMENS.severeAlert} expanded={expanded} />
                        <AttendanceCard evidence={ATTENDANCE_SPECIMENS.present} expanded={expanded} />
                        <StaffCard evidence={STAFF_SPECIMENS.severalRoles} expanded={expanded} />
                        <BillingCard evidence={BILLING_SPECIMENS.balanceDue} expanded={expanded} />
                    </div>
                </>
            ) : null}
        </div>
    );
}
