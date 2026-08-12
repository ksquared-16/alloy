import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import {
    SYSTEM5_CARD_ARCHETYPE,
    system5ArchetypeForCard,
} from "@/lib/adminV2/runtime/focusPanel/system5CardArchetypes";
import { minimalSettledOpportunityDrawerViewModel } from "@/tests/adminV2/viewModel/fixtures/minimalSettledOpportunityDrawerViewModel";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("System 5A Universal Card Archetypes", () => {
    const baseVm = minimalSettledOpportunityDrawerViewModel({
        summaries: {
            attention: {
                visible: true,
                needs_attention: true,
                primary_reason: "Medical form outstanding",
                reason_count: 2,
            },
            tasks: {
                state: "loaded",
                open_count: 1,
                open_tasks: [
                    { id: "t1", title: "Tour follow-up overdue", due_at: "", status: "open", source: "task_assist" },
                ],
            },
            active_tour_bookings: [],
            reminders: {
                state: "empty",
                next_follow_up_iso: null,
                scheduled_send_count: 0,
                scheduled_sends: [],
            },
            bos: null,
        },
    });

    it("maps platform card keys to canonical archetypes", () => {
        expect(system5ArchetypeForCard("attention")).toBe("action");
        expect(system5ArchetypeForCard("health")).toBe("status");
        expect(system5ArchetypeForCard("household")).toBe("profile");
        expect(system5ArchetypeForCard("children")).toBe("collection");
        expect(system5ArchetypeForCard("work_launcher")).toBe("launcher");
        expect(system5ArchetypeForCard("timeline")).toBe("timeline");
        // Employment is a `profile` for the same reason Household is: it answers with named
        // fields about a person, not a collection of rows.
        expect(system5ArchetypeForCard("employment")).toBe("profile");
        // Full `Record<FocusPanelCardKey, …>`, so this tracks the card vocabulary exactly.
        expect(Object.keys(SYSTEM5_CARD_ARCHETYPE)).toHaveLength(24);
    });

    it("derives action archetype for Why Now with operational insight", () => {
        const { cards } = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: baseVm,
            record: {},
            title: "Wright Family",
            perspective: null,
            statusLabel: "Lead",
        });
        const attention = cards.get("attention");
        expect(attention?.archetype).toBe("action");
        expect(attention?.insight).toBe("Medical form outstanding");
    });

    it("derives status archetype with named issue breakdown", () => {
        const { cards } = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: baseVm,
            record: {},
            title: "Wright Family",
            perspective: null,
            statusLabel: "Lead",
        });
        const health = cards.get("health");
        expect(health?.archetype).toBe("status");
        expect(health?.payload?.statusIssues?.length).toBeGreaterThan(0);
        expect(health?.payload?.statusIssues?.[0]).toContain("Medical form");
    });

    it("derives profile archetype with missing-information rule", () => {
        const { cards } = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: baseVm,
            record: {
                "person.primary_contact_name": "Justin Wright",
                "person.primary_phone": "555-555-5555",
            },
            title: "Wright Family",
            perspective: null,
            statusLabel: "Lead",
        });
        const household = cards.get("household");
        expect(household?.archetype).toBe("profile");
        const fields = household?.payload?.profileFields ?? [];
        expect(fields.find((f) => f.label === "Primary Contact")?.value).toBe("Justin Wright");
        expect(fields.find((f) => f.label === "Email")?.value).toBeNull();
        expect(fields.find((f) => f.label === "Secondary Contact")?.value).toBeNull();
    });

    it("derives collection archetype with per-item status and overflow", () => {
        const { cards } = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: baseVm,
            record: {
                _inquiry_children: [
                    { id: "c1", display_name: "Emyrson", outcome_status_key: "active", outcome_status_label: "Waiting on Forms" },
                    { id: "c2", display_name: "McKenzie", outcome_status_key: "active", outcome_status_label: "Ready" },
                    { id: "c3", display_name: "Alex", outcome_status_key: "active" },
                ],
            },
            title: "Wright Family",
            perspective: null,
            statusLabel: "Lead",
        });
        const children = cards.get("children");
        expect(children?.archetype).toBe("collection");
        expect(children?.payload?.collectionItems?.map((i) => i.label)).toEqual(["Emyrson", "McKenzie", "Alex"]);
        expect(children?.payload?.overflowCount).toBe(0);
    });

    it("derives launcher archetype rows for work mode", () => {
        const { cards } = deriveOpportunityFocusPanelPresentation({
            mode: "work",
            displayVm: baseVm,
            record: {},
            title: "Wright Family",
            perspective: null,
            statusLabel: "Lead",
        });
        const launcher = cards.get("work_launcher");
        expect(launcher?.archetype).toBe("launcher");
        expect(launcher?.payload?.launcherRows?.length).toBe(3);
        expect(launcher?.primaryAction).toBeNull();
    });

    it("renderer exposes data-card-archetype and ArchetypeCardBody", () => {
        const renderer = readSrc("components/admin/focusPanel/FocusPanelCardRenderer.tsx");
        const ucard = readSrc("components/admin/focusPanel/UniversalCard.tsx");
        const body = readSrc("components/admin/focusPanel/ArchetypeCardBody.tsx");
        expect(renderer).toContain("ArchetypeCardBody");
        expect(ucard).toContain("data-card-archetype");
        expect(body).toContain('data-card-archetype-body="profile"');
        expect(body).toContain('data-card-archetype-body="collection"');
        expect(body).toContain('data-card-archetype-body="launcher"');
    });

    it("activity communications embed includes summary strip before workspace", () => {
        const workspace = readSrc("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        expect(workspace).toContain('data-activity-comms-summary="true"');
        expect(workspace).toContain("CommunicationsDrawerSection");
        expect(workspace).not.toContain("composer");
    });
});
