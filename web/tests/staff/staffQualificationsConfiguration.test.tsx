// @vitest-environment jsdom
/**
 * STUDIO CONFIGURES POLICY. IT DOES NOT RECORD FACTS.
 *
 * The properties locked here are the ones that make a requirement MEAN something:
 *
 *  1. A SCOPE TARGET IS CHOSEN FROM A CANONICAL LIST, never typed. A requirement naming an id that
 *     does not exist would read as configured and apply to nobody.
 *  2. CHANGING THE AXIS CLEARS THE TARGET. A position id is not a site id, and carrying one over
 *     authors a rule pointing at the wrong kind of thing — which also reads as configured.
 *  3. ORGANIZATION SCOPE SENDS NULL, not "". The empty string is a target that resolves to nothing;
 *     null is the absence of a target, which is what "everyone" means.
 *  4. STUDIO SEES WHAT IT RETIRED. It is the only surface that reads inactive types, because it is
 *     the surface that retires and revives them.
 *
 * And the registration contract: a Studio section is only reachable when its key, its tab, its mode
 * and its deep-link resolver all agree. Three out of four is a tab that cannot be linked to, or a
 * link that lands on a tab that is not shown.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/workspace/WorkspaceCard", () => ({
    default: ({ children, ...rest }: { children?: unknown }) => <div {...rest}>{children as never}</div>,
}));
vi.mock("@/components/workspace/AlloySelect", () => ({
    AlloySelect: ({
        value,
        onChange,
        options,
        testId,
    }: {
        value: string;
        onChange: (v: string) => void;
        options: readonly { value: string; label: string }[];
        testId?: string;
    }) => (
        <select
            data-testid={testId}
            value={value}
            onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        >
            <option value="" />
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));

import StaffQualificationsStudioPanel from "@/components/adminV2/staff/screens/StaffQualificationsStudioPanel";
import {
    OPERATIONS_SECTION_MODE,
    OPERATIONS_STUDIO_TABS,
    resolveOperationsStudioSection,
} from "@/app/adminV2/operations/operationsSections";

const TYPE_ACTIVE = {
    id: "type-cpr",
    key: "cpr",
    label: "CPR Certification",
    description: null,
    category: null,
    expiration_expected: true,
    default_validity_days: 730,
    evidence_required_default: true,
    is_active: true,
    sort_order: 1,
};
const TYPE_RETIRED = {
    ...TYPE_ACTIVE,
    id: "type-old",
    key: "old_cert",
    label: "Retired Credential",
    is_active: false,
    sort_order: 2,
};

const SITES = [{ id: "site-1", name: "North Campus" }];
const ASSIGNMENT_TYPES = [{ id: "at-1", label: "Before Care" }];
const POSITIONS = [{ id: "pos-1", title: "Lead Teacher" }];

function configPayload(over: Record<string, unknown> = {}) {
    return {
        qualification_types: [TYPE_ACTIVE, TYPE_RETIRED],
        qualification_requirements: [],
        ...over,
    };
}

// React 18+ requires this flag before `act` will flush updates without warning.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let posted: Record<string, unknown>[];

function stubFetch(config: Record<string, unknown>, postResponse?: { ok: boolean; body: unknown }) {
    posted = [];
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/api/admin/employment-positions")) {
            return { ok: true, json: async () => ({ positions: POSITIONS }) };
        }
        if (init?.method === "POST") {
            posted.push(JSON.parse(String(init.body)));
            return {
                ok: postResponse?.ok ?? true,
                json: async () => postResponse?.body ?? { qualification_requirement: {} },
            };
        }
        return { ok: true, json: async () => config };
    });
    vi.stubGlobal("fetch", mock);
    return mock;
}

async function render() {
    await act(async () => {
        root.render(
            <StaffQualificationsStudioPanel sites={SITES} assignmentTypes={ASSIGNMENT_TYPES} />,
        );
    });
    await act(async () => {});
    await act(async () => {});
}

function click(selector: string) {
    const el = container.querySelector<HTMLElement>(selector);
    expect(el, `expected ${selector} to be present`).not.toBeNull();
    return act(async () => {
        el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

/**
 * React installs its own `value` setter on the input node, so assigning `el.value` changes what the
 * DOM shows and React never hears about it. The native setter is the one React's listener reads,
 * which is why this goes through the prototype descriptor rather than the property.
 */
function typeInto(selector: string, value: string) {
    const el = container.querySelector<HTMLInputElement>(selector);
    expect(el, `expected input ${selector} to be present`).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    return act(async () => {
        setter.call(el, value);
        el!.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function setSelect(testId: string, value: string) {
    const el = container.querySelector<HTMLSelectElement>(`[data-testid="${testId}"]`);
    expect(el, `expected select ${testId} to be present`).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    return act(async () => {
        setter.call(el, value);
        el!.dispatchEvent(new Event("change", { bubbles: true }));
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

describe("Studio → Qualifications is registered in every place a section must be", () => {
    it("has a tab, a mode and a deep-link resolution that all agree", () => {
        expect(OPERATIONS_STUDIO_TABS.map((t) => t.key)).toContain("qualifications");
        expect(OPERATIONS_SECTION_MODE.qualifications).toBe("studio");
        expect(resolveOperationsStudioSection("qualifications")).toBe("qualifications");
        // And an unknown section still refuses rather than falling through to this one.
        expect(resolveOperationsStudioSection("nonsense")).toBeNull();
    });
});

describe("Studio → Qualifications", () => {
    it("reads inactive types too, because Studio is where they were retired", async () => {
        const fetchMock = stubFetch(configPayload());
        await render();

        const configRead = fetchMock.mock.calls.find((c) =>
            String(c[0]).includes("/api/admin/staff-qualification-config"),
        );
        expect(String(configRead![0])).toContain("include_inactive=true");
        expect(container.querySelector('[data-qualification-type-id="type-old"]')).not.toBeNull();
        expect(
            container
                .querySelector('[data-qualification-type-id="type-old"]')!
                .getAttribute("data-qualification-type-active"),
        ).toBe("false");
    });

    it("authors a requirement against a CHOSEN position, not a typed id", async () => {
        stubFetch(configPayload());
        await render();
        await click('[data-qualification-config-action="new-requirement"]');
        await setSelect("qualification-requirement-scope_type", "position");

        const target = container.querySelector<HTMLSelectElement>(
            '[data-testid="qualification-requirement-scope_id"]',
        )!;
        // The options are the canonical positions, fetched — not free text.
        expect([...target.options].map((o) => o.value)).toEqual(["", "pos-1"]);

        await setSelect("qualification-requirement-scope_id", "pos-1");
        await setSelect("qualification-requirement-requirement_level", "enforced");
        await act(async () => {
            container
                .querySelector('[data-qualification-requirement-form="create"]')!
                .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        await act(async () => {});

        expect(posted).toHaveLength(1);
        expect(posted[0]).toMatchObject({
            action: "upsert_requirement",
            scope_type: "position",
            scope_id: "pos-1",
            requirement_level: "enforced",
        });
    });

    it("clears the target when the axis changes — a position id is not a site id", async () => {
        stubFetch(configPayload());
        await render();
        await click('[data-qualification-config-action="new-requirement"]');
        await setSelect("qualification-requirement-scope_type", "position");
        await setSelect("qualification-requirement-scope_id", "pos-1");
        await setSelect("qualification-requirement-scope_type", "site");

        const target = container.querySelector<HTMLSelectElement>(
            '[data-testid="qualification-requirement-scope_id"]',
        )!;
        expect([...target.options].map((o) => o.value)).toEqual(["", "site-1"]);

        /*
         * Asserted on what is SUBMITTED, not on what the select displays.
         *
         * A `<select>` whose value names no option reports "" on its own, so reading the DOM here
         * passes whether or not the stale id was cleared. It was: a plant that retained `scopeId`
         * across the axis change left this DOM assertion green and posted `scope_id: "pos-1"` under
         * `scope_type: "site"` — a requirement pointing at a position, filed as a site rule.
         */
        await act(async () => {
            container
                .querySelector('[data-qualification-requirement-form="create"]')!
                .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        await act(async () => {});
        expect(posted[0]).toMatchObject({ scope_type: "site" });
        expect(posted[0]!.scope_id).toBeNull();
    });

    it("sends null — not an empty string — for organization scope", async () => {
        stubFetch(configPayload());
        await render();
        await click('[data-qualification-config-action="new-requirement"]');
        // Organization is the default axis, and it offers no target at all.
        expect(container.querySelector('[data-testid="qualification-requirement-scope_id"]')).toBeNull();

        await act(async () => {
            container
                .querySelector('[data-qualification-requirement-form="create"]')!
                .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        await act(async () => {});

        expect(posted[0]!.scope_id).toBeNull();
    });

    it("authors a qualification type and lets the server derive a blank key", async () => {
        stubFetch(configPayload());
        await render();
        await click('[data-qualification-config-action="new-type"]');

        await typeInto('[data-qualification-type-field="label"]', "Food Handler");
        await act(async () => {
            container
                .querySelector('[data-qualification-type-form="create"]')!
                .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        await act(async () => {});

        expect(posted[0]).toMatchObject({ action: "upsert_type", label: "Food Handler", key: null });
    });

    it("surfaces a server refusal verbatim and keeps the form open", async () => {
        stubFetch(configPayload(), {
            ok: false,
            body: { error: "You do not have permission to change organization vocabulary." },
        });
        await render();
        await click('[data-qualification-config-action="new-requirement"]');
        await act(async () => {
            container
                .querySelector('[data-qualification-requirement-form="create"]')!
                .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        await act(async () => {});

        expect(container.querySelector("[data-qualification-config-error]")!.textContent).toBe(
            "You do not have permission to change organization vocabulary.",
        );
        // The work is not thrown away on a refusal the operator may be able to resolve.
        expect(container.querySelector('[data-qualification-requirement-form="create"]')).not.toBeNull();
    });
});
