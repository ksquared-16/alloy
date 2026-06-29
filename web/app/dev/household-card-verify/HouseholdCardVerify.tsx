"use client";

/**
 * Renders the PRODUCTION HouseholdCard against fixture Operational Contexts.
 * This is a verification harness, not a mock — it imports the real component and
 * the real runtime stylesheet so the screenshots reflect shipped behavior.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import HouseholdCard from "@/components/admin/focusPanel/cards/HouseholdCard";
import ChildrenCard from "@/components/admin/focusPanel/cards/ChildrenCard";
import CurrentWorkCard from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import ReadinessCard from "@/components/admin/focusPanel/cards/ReadinessCard";
import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import { SUMMARY_GRID } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { system5IconForCard } from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";
import {
    isElevatedLevel,
    type FocusPanelActiveDepth,
    type FocusPanelCoordination,
    type FocusPanelDismissSignal,
    type FocusPanelFocusRequest,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    OperationalContext,
    OperationalContextSignals,
} from "@/lib/adminV2/runtime/operationalContext/types";
import "@/app/adminV2/components/alloyOsRuntime.css";

const MODEL: FocusPanelCardModel = {
    key: "household",
    archetype: "profile",
    title: "Household",
    insight: "",
    tier: "reference",
    span: 2,
    density: "compact",
    iconName: "users",
    visible: true,
};

function cardModel(key: FocusPanelCardModel["key"], title: string, iconName: string): FocusPanelCardModel {
    return { ...MODEL, key, title, iconName };
}

const EMPTY_SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null },
};

function ctx(
    truth: Record<string, unknown>,
    opts?: { masked?: boolean; label?: string; signals?: OperationalContextSignals },
): OperationalContext {
    return {
        subject: { type: "opportunity", id: String(truth.id ?? "opp"), label: opts?.label ?? "Household" },
        businessProcess: { key: "enrollment", label: "Tour scheduled", stageKey: "tour" },
        perspective: { missionLabel: "Confirm enrollment readiness" },
        truth,
        signals: opts?.signals ?? EMPTY_SIGNALS,
        capabilities: { canMutate: true, maskedChannels: opts?.masked ?? false },
        status: "ready",
    };
}

const FULL: Record<string, unknown> = {
    id: "opp-full",
    updated_at: "2026-06-20T10:00:00Z",
    _customer_name: "Johnson Household",
    "person.primary_contact_name": "Sarah Johnson",
    "person.primary_phone": "(555) 123-4567",
    "person.primary_email": "sarah@example.com",
    "person.primary_address_line1": "742 Evergreen Terrace",
    "person.primary_address_city": "Springfield",
    "person.primary_address_state": "OR",
    "person.primary_address_postal_code": "97403",
    "opportunity.primary_person_id": "p-sarah",
    _opportunity_persons: [
        { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson", phone: "(555) 123-4567", email: "sarah@example.com" },
        { person_id: "p-mike", role_type: "parent", name: "Michael Johnson", phone: "(555) 111-2222" },
        { person_id: "p-gran", role_type: "emergency_contact", name: "Grandma Mary", phone: "(555) 333-4444" },
        { person_id: "p-lisa", role_type: "emergency_contact", name: "Aunt Lisa", phone: "(555) 444-5555" },
        { person_id: "p-tom", role_type: "authorized_pickup", name: "Uncle Tom" },
        { person_id: "p-pay", role_type: "billing_contact", name: "Sarah Johnson" },
    ],
    _inquiry_children: [
        { id: "c1", display_name: "Emma Johnson", age: "6", desired_program_label: "Preschool", outcome_status_label: "Enrolled" },
        { id: "c2", display_name: "Liam Johnson", age: "4", outcome_status_label: "Enrolled" },
        { id: "c3", display_name: "Noah Johnson", age: "3" },
    ],
};

const MISSING_PRIMARY: Record<string, unknown> = {
    id: "opp-noprimary",
    _customer_name: "Pending Household",
    _opportunity_persons: [
        { person_id: "p-gran", role_type: "emergency_contact", name: "Grandma Mary", phone: "(555) 333-4444" },
    ],
    _inquiry_children: [{ id: "c1", display_name: "Emma" }],
};

const MISSING_EMERGENCY: Record<string, unknown> = {
    id: "opp-noemerg",
    _customer_name: "Smith Household",
    "person.primary_contact_name": "Dana Smith",
    _opportunity_persons: [
        { person_id: "p-dana", role_type: "primary_contact", name: "Dana Smith", phone: "(555) 777-8888" },
    ],
    _inquiry_children: [{ id: "c1", display_name: "Ava" }],
};

const EMPTY: Record<string, unknown> = { id: "opp-empty", _opportunity_persons: [], _inquiry_children: [] };

const CORE_FOUR_SIGNALS: OperationalContextSignals = {
    work: {
        primary: { id: "t1", label: "Confirm tour booking", state: "open", dueLabel: "Due today", dueAt: "2026-06-27", urgency: "today", source: "BOS Assist", kind: "task" },
        items: [
            { id: "t1", label: "Confirm tour booking", state: "open", dueLabel: "Due today", dueAt: "2026-06-27", urgency: "today", source: "BOS Assist", kind: "task" },
            { id: "t2", label: "Send enrollment packet", state: "open", dueLabel: "Due Jun 30", dueAt: "2026-06-30", urgency: "upcoming", source: "workflow", kind: "task" },
        ],
        openCount: 2,
        overdueCount: 0,
        nextActionLabel: "Advance to enrolled",
    },
    attention: { needsAttention: true, primaryReason: "Immunization record missing", reasonCount: 1 },
    tour: { scheduled: true, startAt: "2026-06-27T10:00:00Z", statusLabel: "confirmed" },
};

const CHILDREN_MODEL = cardModel("children", "Children", "users");
const WORK_MODEL = cardModel("current_work", "Current work", "check");
const READINESS_MODEL = cardModel("readiness_kpi", "Readiness", "gauge");

function compositionModel(key: FocusPanelCardModel["key"], title: string): FocusPanelCardModel {
    const cell = SUMMARY_GRID.rows.flatMap((r) => r.cells).find((c) => c.key === key);
    return {
        ...MODEL,
        key,
        title,
        iconName: system5IconForCard(key) ?? MODEL.iconName,
        span: (cell?.span as FocusPanelCardModel["span"]) ?? 1,
        density: (cell?.density as FocusPanelCardModel["density"]) ?? "standard",
    };
}

/**
 * Faithful Overview composition preview — the REAL `FocusPanelCardGrid` engine and
 * the REAL `SUMMARY_GRID` footprint spans, rendering the production pure cards.
 * Only the data is fixture. This mirrors the operator Summary surface composition.
 */
function OverviewComposition({ context }: { context: OperationalContext }) {
    const rows = SUMMARY_GRID.rows.map((row) => ({
        cells: row.cells.map((cell) => ({ key: cell.key, span: cell.span, density: cell.density })),
    }));
    // Composition Engine input — same Core Four, composed from card semantics.
    const composeCards = rows.flatMap((row) =>
        row.cells.map((cell) => ({ key: cell.key, typeKey: cell.key as FocusPanelCardKey })),
    );

    // Live cross-card coordination + depth: Readiness factor → owner card focus,
    // and focused/edit cards raise above the grid (demo of the production seam,
    // exercised in the harness so it is screenshot-able).
    const [request, setRequest] = useState<FocusPanelFocusRequest | null>(null);
    const nonceRef = useRef(0);
    const requestFocus = useCallback<FocusPanelCoordination["requestFocus"]>((card, focus) => {
        nonceRef.current += 1;
        setRequest({ card, focus, nonce: nonceRef.current });
    }, []);
    const [activeDepth, setActiveDepth] = useState<FocusPanelActiveDepth | null>(null);
    const reportPerspective = useCallback<NonNullable<FocusPanelCoordination["reportPerspective"]>>(
        (card, level) => {
            setActiveDepth((prev) =>
                isElevatedLevel(level) ? { card, level } : prev?.card === card ? null : prev,
            );
        },
        [],
    );
    const [dismissed, setDismissed] = useState<FocusPanelDismissSignal | null>(null);
    const dismissNonceRef = useRef(0);
    const dismiss = useCallback<NonNullable<FocusPanelCoordination["dismiss"]>>((card) => {
        dismissNonceRef.current += 1;
        setDismissed({ card, nonce: dismissNonceRef.current });
    }, []);
    const coordination = useMemo<FocusPanelCoordination>(
        () => ({ request, requestFocus, activeDepth, reportPerspective, dismissed, dismiss }),
        [request, requestFocus, activeDepth, reportPerspective, dismissed, dismiss],
    );

    useEffect(() => {
        if (!activeDepth) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") dismiss(activeDepth.card);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [activeDepth, dismiss]);

    return (
        <FocusPanelCardGrid
            rows={rows}
            composeCards={composeCards}
            elevatedCellKey={activeDepth?.card ?? null}
            onBackdropClick={() => {
                if (activeDepth) dismiss(activeDepth.card);
            }}
            renderCell={(key) => {
                if (key === "household")
                    return <HouseholdCard model={compositionModel("household", "Household")} context={context} coordination={coordination} />;
                if (key === "children")
                    return <ChildrenCard model={compositionModel("children", "Children")} context={context} coordination={coordination} />;
                if (key === "current_work")
                    return <CurrentWorkCard model={compositionModel("current_work", "Current work")} context={context} coordination={coordination} />;
                if (key === "readiness_kpi")
                    return <ReadinessCard model={compositionModel("readiness_kpi", "Readiness")} context={context} coordination={coordination} />;
                return null;
            }}
        />
    );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>{label}</div>
            <div style={{ width: 360 }}>{children}</div>
        </div>
    );
}

export default function HouseholdCardVerify() {
    return (
        <div className="alloy-os-runtime" style={{ background: "#f4f6f9", minHeight: "100vh", padding: "88px 40px 64px", display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
            <div style={{ width: "100%", maxWidth: 880 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Household Card — production component verification</h1>
                <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>
                    Real <code>HouseholdCard</code> rendered from fixture <code>OperationalContext</code> values.
                    Click <em>View household →</em> then an evidence group to verify Evidence / Focused locally (no fetch).
                </p>
            </div>

            <div style={{ width: "100%" }} data-overview-composition="true">
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Overview composition — Core Four (real grid + footprints)</h2>
                <p style={{ fontSize: 13, color: "#475569", margin: "0 0 12px", maxWidth: 880 }}>
                    The production <code>FocusPanelCardGrid</code> driven by the{" "}
                    <code>Composition Engine</code>: heavy anchors (Household, Children) compose a
                    dominant lead lane beside a balancing support lane (Readiness, Current Work).
                    Different widths, natural heights — interlocking, not a uniform grid.
                </p>
                <div className="alloy-os-runtime" style={{ width: 960, background: "#f6f8fc", border: "1px solid #e5e9ef", borderRadius: 12 }}>
                    <OverviewComposition context={ctx(FULL, { label: "Johnson Household", signals: CORE_FOUR_SIGNALS })} />
                </div>
            </div>
            <Panel label="Overview (full household + address)"><HouseholdCard model={MODEL} context={ctx(FULL, { label: "Johnson Household" })} /></Panel>
            <Panel label="Missing primary"><HouseholdCard model={MODEL} context={ctx(MISSING_PRIMARY, { label: "Pending Household" })} /></Panel>
            <Panel label="Missing emergency"><HouseholdCard model={MODEL} context={ctx(MISSING_EMERGENCY, { label: "Smith Household" })} /></Panel>
            <Panel label="Permission limited (masked channels)"><HouseholdCard model={MODEL} context={ctx(FULL, { masked: true, label: "Johnson Household" })} /></Panel>
            <Panel label="Empty"><HouseholdCard model={MODEL} context={ctx(EMPTY, { label: "New record" })} /></Panel>

            <div style={{ width: "100%", maxWidth: 880, marginTop: 24 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Core Four — production cards on one Operational Context</h2>
                <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>
                    Real <code>Household</code>, <code>Children</code>, <code>Current Work</code>, and{" "}
                    <code>Readiness</code> rendered from the SAME fixture context (truth + projected signals).
                    Each owns its expand/focus perspective locally.
                </p>
            </div>
            <Panel label="Household"><HouseholdCard model={MODEL} context={ctx(FULL, { label: "Johnson Household", signals: CORE_FOUR_SIGNALS })} /></Panel>
            <Panel label="Children"><ChildrenCard model={CHILDREN_MODEL} context={ctx(FULL, { label: "Johnson Household", signals: CORE_FOUR_SIGNALS })} /></Panel>
            <Panel label="Current Work"><CurrentWorkCard model={WORK_MODEL} context={ctx(FULL, { label: "Johnson Household", signals: CORE_FOUR_SIGNALS })} /></Panel>
            <Panel label="Readiness"><ReadinessCard model={READINESS_MODEL} context={ctx(FULL, { label: "Johnson Household", signals: CORE_FOUR_SIGNALS })} /></Panel>
        </div>
    );
}
