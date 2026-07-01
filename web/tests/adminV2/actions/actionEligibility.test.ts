import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: vi.fn(),
}));
vi.mock("@/lib/admin/statusTransitionRules", () => ({
    validateStatusTransition: vi.fn(),
}));

import {
    resolveAvailableStatusTransitions,
    resolveStatusTransitionBlockers,
} from "@/lib/adminV2/actions/actionEligibility";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";

const supabase = {} as never;

const DEFS = [
    { status_key: "new_inquiry", status_label: "New inquiry" },
    { status_key: "qualification", status_label: "Qualification" },
    { status_key: "lost", status_label: "Lost" },
];

beforeEach(() => {
    vi.clearAllMocks();
    (fetchEffectiveStatusDefinitions as ReturnType<typeof vi.fn>).mockResolvedValue(DEFS);
    (validateStatusTransition as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
});

describe("resolveAvailableStatusTransitions", () => {
    it("returns active statuses excluding the current one", async () => {
        const { options } = await resolveAvailableStatusTransitions(supabase, "org-1", "opportunity", "new_inquiry");
        expect(options.map((o) => o.key)).toEqual(["qualification", "lost"]);
    });
});

describe("resolveStatusTransitionBlockers", () => {
    const base = {
        supabase,
        orgId: "org-1",
        entityType: "opportunity",
        entityId: "opp-1",
        actionKey: "update_status",
        fromStatusKey: "new_inquiry",
        departmentId: null,
        workUnitId: null,
        metadata: {},
        payload: {},
    };

    it("blocks transitions to undefined statuses", async () => {
        const blockers = await resolveStatusTransitionBlockers({ ...base, toStatusKey: "not_a_status" });
        expect(blockers[0]?.code).toBe("invalid_transition");
        expect(validateStatusTransition).not.toHaveBeenCalled();
    });

    it("surfaces rule-engine blocks", async () => {
        (validateStatusTransition as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            message: "This status transition is blocked.",
        });
        const blockers = await resolveStatusTransitionBlockers({ ...base, toStatusKey: "lost" });
        expect(blockers[0]?.code).toBe("transition_blocked");
    });

    it("returns no blockers for an allowed transition", async () => {
        const blockers = await resolveStatusTransitionBlockers({ ...base, toStatusKey: "qualification" });
        expect(blockers).toHaveLength(0);
    });
});
