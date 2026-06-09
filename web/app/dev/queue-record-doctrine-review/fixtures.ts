import type { QueueItemQuickActionVm } from "@/lib/ui-v2/workspace-types";
import type { CrmCompactRowSemanticSlots } from "@/lib/ui-v2/workspace-types";

export const doctrineRowActions: QueueItemQuickActionVm[] = [
    { id: "registry-ask_bos", label: "Ask BOS", actionId: "ask_bos" },
    { id: "log_call", label: "Log call", payload: { action_key: "log_call" } },
    { id: "schedule_tour", label: "Schedule tour", payload: { action_key: "schedule_tour" } },
];

export const doctrineEnrollmentRow: CrmCompactRowSemanticSlots = {
    primaryIdentity: "Johnson Family",
    childName: null,
    stageLabel: "Tour",
    statusLabel: "Tour Scheduled",
    nextStep: "Confirm tour attendance and capture program preference.",
    lastActivity: null,
    commercialValue: null,
    contactSnippet: null,
    programContext: "Toddler Program",
    roomContext: null,
    ageContext: null,
    attentionReason: "Tour date approaching — confirm attendance",
    familyNote: null,
    contactDisplayName: "Sarah Johnson",
    contactPersonId: "person-sarah",
    contactPhoneDisplay: "(503) 555-0198",
    contactEmail: "sarah@example.com",
    locationContext: "Downtown",
    tourContext: "2026-03-12T10:30:00.000Z",
    childrenLines: [
        { primary: "Emma Johnson", personId: "child-emma", secondary: "3y", programInline: "Toddler Program" },
        { primary: "Liam Johnson", personId: "child-liam", secondary: "5y", programInline: "Preschool" },
        { primary: "Noah Johnson", personId: "child-noah", secondary: "1y", programInline: "Infant" },
        { primary: "Ava Johnson", personId: "child-ava", secondary: "4y", programInline: "Preschool" },
        { primary: "Mia Johnson", personId: "child-mia", secondary: "2y", programInline: "Toddler Program" },
        { primary: "Leo Johnson", personId: "child-leo", secondary: "6y", programInline: "Kindergarten" },
    ],
    crmFactGroups: [
        {
            kind: "children_programs",
            label: "",
            columnGrid: {
                headers: ["Child", "Program"],
                rows: [
                    ["Emma Johnson", "Toddler Program"],
                    ["Liam Johnson", "Preschool"],
                    ["Noah Johnson", "Infant"],
                    ["Ava Johnson", "Preschool"],
                    ["Mia Johnson", "Toddler Program"],
                    ["Leo Johnson", "Kindergarten"],
                ],
                columnKeys: ["child_name", "program"],
            },
        },
    ],
};
