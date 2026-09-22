// @vitest-environment jsdom
/**
 * THE CARD MUST NOT PUBLISH A VERDICT IT CANNOT SEE.
 *
 * Two properties are locked here, and both are about restraint rather than output:
 *
 *  1. NO GLOBAL STAFF READY / BLOCKED. Readiness spans more than qualifications. A card that can
 *     only see credentials and prints "Ready" would be read as the whole answer, and the operator
 *     would act on it. The chip this card publishes is always a COUNT with a noun attached.
 *
 *  2. NO OPEN EMPLOYMENT, NO CARD. A qualification hangs off an employment. With none open there is
 *     nowhere for one to hang, and rendering an empty card would assert a staff relationship that
 *     does not exist — the same lie the Employment card documents for `never_employed`.
 *
 * It also locks the distinction the model drew and the card carries: "not held" and "expired" send
 * an operator to different places, so they must not collapse into one "not met".
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/focusPanel/UniversalCard", () => ({
    default: ({
        children,
        statusChip,
        insight,
        supportingInsight,
        footerAction,
    }: {
        children?: unknown;
        statusChip?: string | null;
        insight?: string;
        supportingInsight?: string | null;
        footerAction?: unknown;
    }) => (
        <div>
            <span data-testid="chip">{statusChip ?? ""}</span>
            <span data-testid="insight">{insight ?? ""}</span>
            <span data-testid="secondary">{supportingInsight ?? ""}</span>
            {children as never}
            {footerAction as never}
        </div>
    ),
}));
vi.mock("@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination", () => ({
    useDismissSignal: () => {},
    useReportPerspective: () => {},
}));

import StaffQualificationsCard from "@/components/admin/focusPanel/cards/StaffQualificationsCard";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const MODEL = {
    key: "staff_qualifications",
    archetype: "collection",
    title: "Qualifications",
    insight: "",
    tier: "reference",
    span: 1,
    density: "compact",
    visible: true,
} as unknown as FocusPanelCardModel;

function contextWithEmployment(currentId: string | null): OperationalContext {
    return {
        employment: {
            primary: {
                personId: "person-1",
                personLabel: "A Person",
                employment: {
                    is_staff: currentId != null,
                    current: currentId ? ({ id: currentId } as never) : null,
                    periods: [],
                    configured_facts: [],
                    never_employed: currentId == null,
                },
            },
            people: [
                {
                    personId: "person-1",
                    personLabel: "A Person",
                    employment: {
                        is_staff: currentId != null,
                        current: currentId ? ({ id: currentId } as never) : null,
                        periods: [],
                        configured_facts: [],
                        never_employed: currentId == null,
                    },
                },
            ],
            hasEmployment: currentId != null,
        },
    } as unknown as OperationalContext;
}

const TYPE_CPR = {
    id: "type-cpr",
    key: "cpr",
    label: "CPR Certification",
    expiration_expected: true,
    evidence_required_default: true,
};
const TYPE_FIRST_AID = {
    id: "type-first-aid",
    key: "first_aid",
    label: "First Aid",
    expiration_expected: true,
    evidence_required_default: false,
};

function payload(over: Record<string, unknown> = {}) {
    return {
        as_of: "2026-09-20",
        types: [TYPE_CPR, TYPE_FIRST_AID],
        held: [],
        requirements: [],
        satisfaction: [],
        ...over,
    };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(context: OperationalContext) {
    await act(async () => {
        root.render(<StaffQualificationsCard model={MODEL} context={context} />);
    });
    // One more flush: the read is kicked off in an effect and resolves a microtask later.
    await act(async () => {});
}

function expand() {
    const button = container.querySelector<HTMLButtonElement>(
        '[data-staff-qualifications-action="expand"]',
    );
    expect(button, "the card should offer an expand affordance").not.toBeNull();
    return act(async () => {
        button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("Staff Qualifications card", () => {
    it("renders nothing when the person holds no OPEN employment", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await render(contextWithEmployment(null));

        expect(container.querySelector("[data-staff-qualifications-card]")).toBeNull();
        // And it did not even ask: there is no employment to ask about.
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reads for the OPEN employment, and derives standing against the org day the server sent", async () => {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
            ok: true,
            json: async () =>
                payload({
                    held: [
                        {
                            id: "q-1",
                            qualification_type_id: "type-cpr",
                            issued_on: "2025-01-15",
                            expires_on: "2026-01-15",
                            verification_state: "verified",
                            supersedes_qualification_id: null,
                            revoked_at: null,
                            standing: "expired",
                            days_until_expiry: -248,
                            evidence_count: 1,
                        },
                    ],
                }),
        }));
        vi.stubGlobal("fetch", fetchMock);

        await render(contextWithEmployment("emp-1"));

        const url = String(fetchMock.mock.calls[0]![0]);
        expect(url).toContain("/api/admin/staff-qualifications");
        expect(url).toContain("employment_id=emp-1");

        // The day is the SERVER's, echoed onto the card so a reader can see which day was used.
        const card = container.querySelector("[data-staff-qualifications-card]")!;
        expect(card.getAttribute("data-staff-qualifications-as-of")).toBe("2026-09-20");

        await expand();
        const row = container.querySelector('[data-staff-qualification-id="q-1"]')!;
        expect(row.getAttribute("data-staff-qualification-standing")).toBe("expired");
        expect(row.textContent).toContain("CPR Certification");
        expect(row.textContent).toContain("Expired");
        // A verified qualification offers no Verify command — verification is not re-runnable here.
        expect(row.querySelector('[data-staff-qualification-command="verify"]')).toBeNull();
    });

    it("counts unmet REQUIRED requirements and never prints a global Ready/Blocked verdict", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () =>
                    payload({
                        satisfaction: [
                            {
                                requirement: {
                                    qualificationTypeId: "type-cpr",
                                    level: "required",
                                    evidenceRequired: true,
                                    provenance: [
                                        { scopeType: "position", scopeId: "pos-1", level: "required" },
                                        { scopeType: "organization", scopeId: null, level: "recommended" },
                                    ],
                                },
                                satisfied: false,
                                reason: "missing",
                            },
                            {
                                requirement: {
                                    qualificationTypeId: "type-first-aid",
                                    level: "suggested",
                                    evidenceRequired: false,
                                    provenance: [{ scopeType: "site", scopeId: "site-1", level: "suggested" }],
                                },
                                satisfied: false,
                                reason: "missing",
                            },
                        ],
                    }),
            })),
        );

        await render(contextWithEmployment("emp-1"));

        // ONE unmet, not two: a suggestion that raised an alarm would train an operator to ignore
        // the alarm, so `suggested` is reported separately and never folded into the count.
        expect(container.querySelector('[data-testid="chip"]')!.textContent).toBe("1 unmet");

        const text = container.textContent ?? "";
        expect(text).not.toMatch(/\bBlocked\b/);
        expect(text).not.toMatch(/\bStaff Ready\b/);
        expect(text).not.toMatch(/\bNot ready\b/);

        await expand();
        const required = container.querySelector('[data-staff-requirement-type-id="type-cpr"]')!;
        expect(required.getAttribute("data-staff-requirement-satisfied")).toBe("false");
        expect(required.getAttribute("data-staff-requirement-level")).toBe("required");
        expect(required.textContent).toContain("Not held");
        // WHY it applies, carried rather than summarised — both contributing scopes survive.
        const provenance = required.querySelector('[data-staff-requirement-provenance]')!;
        expect(provenance.textContent).toContain("Position");
        expect(provenance.textContent).toContain("Organization");
    });

    it("keeps 'not held' and 'expired' apart, because they send an operator to different places", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () =>
                    payload({
                        satisfaction: [
                            {
                                requirement: {
                                    qualificationTypeId: "type-cpr",
                                    level: "enforced",
                                    evidenceRequired: false,
                                    provenance: [{ scopeType: "organization", scopeId: null, level: "enforced" }],
                                },
                                satisfied: false,
                                reason: "expired",
                            },
                            {
                                requirement: {
                                    qualificationTypeId: "type-first-aid",
                                    level: "required",
                                    evidenceRequired: false,
                                    provenance: [{ scopeType: "organization", scopeId: null, level: "required" }],
                                },
                                satisfied: false,
                                reason: "missing",
                            },
                        ],
                    }),
            })),
        );

        await render(contextWithEmployment("emp-1"));
        await expand();

        expect(
            container.querySelector('[data-staff-requirement-type-id="type-cpr"]')!.textContent,
        ).toContain("Expired");
        expect(
            container.querySelector('[data-staff-requirement-type-id="type-first-aid"]')!.textContent,
        ).toContain("Not held");
    });

    it("warns on a valid qualification inside the expiry window without calling it unmet", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () =>
                    payload({
                        held: [
                            {
                                id: "q-2",
                                qualification_type_id: "type-first-aid",
                                issued_on: "2025-10-01",
                                expires_on: "2026-10-15",
                                verification_state: "unverified",
                                supersedes_qualification_id: null,
                                revoked_at: null,
                                standing: "valid",
                                days_until_expiry: 25,
                                evidence_count: 0,
                            },
                        ],
                    }),
            })),
        );

        await render(contextWithEmployment("emp-1"));

        expect(container.querySelector('[data-testid="chip"]')!.textContent).toBe("1 expiring");
        expect(container.querySelector('[data-testid="insight"]')!.textContent).toBe(
            "1 valid of 1 recorded",
        );
    });

    it("runs Verify through the registered command, then re-reads rather than splicing", async () => {
        const held = {
            id: "q-3",
            qualification_type_id: "type-cpr",
            issued_on: "2026-01-01",
            expires_on: "2027-01-01",
            verification_state: "unverified",
            supersedes_qualification_id: null,
            revoked_at: null,
            standing: "valid",
            days_until_expiry: 365,
            evidence_count: 1,
        };
        const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
            if (String(url).includes("/api/admin/actions/execute")) {
                return { ok: true, json: async () => ({ ok: true }) };
            }
            return { ok: true, json: async () => payload({ held: [held] }) };
        });
        vi.stubGlobal("fetch", fetchMock);

        await render(contextWithEmployment("emp-1"));
        await expand();

        const verify = container.querySelector<HTMLButtonElement>(
            '[data-staff-qualification-command="verify"]',
        )!;
        await act(async () => {
            verify.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {});

        const executeCall = fetchMock.mock.calls.find((c) =>
            String(c[0]).includes("/api/admin/actions/execute"),
        );
        expect(executeCall, "Verify must go through the registered command").toBeDefined();
        const body = JSON.parse((executeCall![1] as unknown as { body: string }).body);
        expect(body.action_key).toBe("staff_qualification.verify");
        // The command's subject is the PERSON — that is the entity type the action declares.
        expect(body.entity_type).toBe("person");
        expect(body.entity_id).toBe("person-1");
        expect(body.payload).toMatchObject({ qualification_id: "q-3", verification_state: "verified" });

        // Two reads of the state endpoint: the mount, and the re-read after the write. The list and
        // the requirement answer only agree if both come from the same read.
        const stateReads = fetchMock.mock.calls.filter((c) =>
            String(c[0]).includes("/api/admin/staff-qualifications"),
        );
        expect(stateReads).toHaveLength(2);
    });

    it("records and RENEWS through one command, because renewal is a record carrying its predecessor", async () => {
        const held = {
            id: "q-9",
            qualification_type_id: "type-cpr",
            issued_on: "2025-01-01",
            expires_on: "2026-01-01",
            verification_state: "verified",
            supersedes_qualification_id: null,
            revoked_at: null,
            standing: "expired",
            days_until_expiry: -10,
            evidence_count: 0,
        };
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (String(url).includes("/api/admin/actions/execute")) {
                return { ok: true, json: async () => ({ ok: true }) };
            }
            return { ok: true, json: async () => payload({ held: [held] }) };
        });
        vi.stubGlobal("fetch", fetchMock);
        await render(contextWithEmployment("emp-1"));
        await expand();

        // RENEW pre-fills the type it is replacing and carries it as `supersedes`.
        await act(async () => {
            container
                .querySelector('[data-staff-qualification-command="renew"]')!
                .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(container.querySelector('[data-staff-qualification-form="renew"]')).not.toBeNull();
        await act(async () => {
            container
                .querySelector('[data-staff-qualification-form="renew"]')!
                .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        await act(async () => {});

        const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/actions/execute"));
        const body = JSON.parse((call![1] as unknown as { body: string }).body);
        expect(body.action_key).toBe("staff_qualification.record");
        // The predecessor is kept as history, never overwritten: a credential that was valid last
        // year WAS valid, and editing the row would erase that.
        expect(body.payload.supersedes_qualification_id).toBe("q-9");
        expect(body.payload.qualification_type_id).toBe("type-cpr");
        expect(body.payload.employment_id).toBe("emp-1");
    });

    it("attaches evidence by REFERENCE to a document the canonical authority already holds", async () => {
        const held = {
            id: "q-10",
            qualification_type_id: "type-cpr",
            issued_on: "2026-01-01",
            expires_on: "2027-01-01",
            verification_state: "verified",
            supersedes_qualification_id: null,
            revoked_at: null,
            standing: "valid",
            days_until_expiry: 300,
            evidence_count: 0,
        };
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            const u = String(url);
            if (u.includes("/api/admin/actions/execute")) return { ok: true, json: async () => ({ ok: true }) };
            if (u.includes("/api/admin/documents")) {
                return { ok: true, json: async () => ({ documents: [{ id: "doc-1", name: "QA Staff CPR Certificate" }] }) };
            }
            return { ok: true, json: async () => payload({ held: [held] }) };
        });
        vi.stubGlobal("fetch", fetchMock);
        await render(contextWithEmployment("emp-1"));
        await expand();

        await act(async () => {
            container
                .querySelector('[data-staff-qualification-command="attach-evidence"]')!
                .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {});
        // The candidates come from Documents. The card never uploads and never copies bytes.
        const option = container.querySelector('[data-staff-qualification-evidence-option="doc-1"]');
        expect(option, "the person's existing documents should be offered").not.toBeNull();
        await act(async () => {
            option!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {});

        const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/actions/execute"));
        const body = JSON.parse((call![1] as unknown as { body: string }).body);
        expect(body.action_key).toBe("staff_qualification.attach_evidence");
        expect(body.payload).toMatchObject({ qualification_id: "q-10", document_id: "doc-1" });
        // A reference, not a copy: nothing resembling file content is sent.
        expect(JSON.stringify(body.payload)).not.toMatch(/base64|bytes|content|storage_path/i);
    });

    it("surfaces a command refusal verbatim instead of swallowing it", async () => {
        const held = {
            id: "q-4",
            qualification_type_id: "type-cpr",
            issued_on: null,
            expires_on: null,
            verification_state: "unverified",
            supersedes_qualification_id: null,
            revoked_at: null,
            standing: "valid",
            days_until_expiry: null,
            evidence_count: 0,
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, _init?: RequestInit) => {
                if (String(url).includes("/api/admin/actions/execute")) {
                    return {
                        ok: true,
                        json: async () => ({
                            ok: false,
                            error: { code: "not_found", message: "That qualification no longer exists." },
                        }),
                    };
                }
                return { ok: true, json: async () => payload({ held: [held] }) };
            }),
        );

        await render(contextWithEmployment("emp-1"));
        await expand();
        await act(async () => {
            container
                .querySelector('[data-staff-qualification-command="verify"]')!
                .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {});

        expect(container.querySelector("[data-staff-qualifications-error]")!.textContent).toBe(
            "That qualification no longer exists.",
        );
    });
});
