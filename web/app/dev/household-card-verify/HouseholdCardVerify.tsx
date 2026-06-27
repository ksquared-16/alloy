"use client";

/**
 * Renders the PRODUCTION HouseholdCard against fixture Operational Contexts.
 * This is a verification harness, not a mock — it imports the real component and
 * the real runtime stylesheet so the screenshots reflect shipped behavior.
 */

import HouseholdCard from "@/components/admin/focusPanel/cards/HouseholdCard";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
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

function ctx(truth: Record<string, unknown>, opts?: { masked?: boolean; label?: string }): OperationalContext {
    return {
        subject: { type: "opportunity", id: String(truth.id ?? "opp"), label: opts?.label ?? "Household" },
        businessProcess: { key: "enrollment", label: "Tour scheduled", stageKey: "tour" },
        perspective: { missionLabel: "Confirm enrollment readiness" },
        truth,
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
            <Panel label="Overview (full household + address)"><HouseholdCard model={MODEL} context={ctx(FULL, { label: "Johnson Household" })} /></Panel>
            <Panel label="Missing primary"><HouseholdCard model={MODEL} context={ctx(MISSING_PRIMARY, { label: "Pending Household" })} /></Panel>
            <Panel label="Missing emergency"><HouseholdCard model={MODEL} context={ctx(MISSING_EMERGENCY, { label: "Smith Household" })} /></Panel>
            <Panel label="Permission limited (masked channels)"><HouseholdCard model={MODEL} context={ctx(FULL, { masked: true, label: "Johnson Household" })} /></Panel>
            <Panel label="Empty"><HouseholdCard model={MODEL} context={ctx(EMPTY, { label: "New record" })} /></Panel>
        </div>
    );
}
