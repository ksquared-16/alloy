import { describe, expect, it } from "vitest";

import { buildSubjectManageMenuFromResolvedActions } from "@/lib/admin/recordManage/buildSubjectManageMenuFromResolvedActions";
import { GENERIC_UMBRELLA_LIFECYCLE_ACTION_KEYS } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActionSurfacePolicy";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

const action = (key: string, label: string): ResolvedActionForClient =>
    ({ key, label, description: null, icon: null }) as ResolvedActionForClient;

/**
 * "Update Lead Status" sat in the operator's Manage menu and failed on click with
 * `target_state is required.` — an error about an argument no operator was ever asked for.
 *
 * It is a runtime-internal umbrella. Domain verbs route through it and supply the target state;
 * chosen directly there is no verb, so it cannot succeed. The platform action catalog already says
 * so (`catalogVisibility: "internal_only"`, "NOT operator-selectable") and the Current Work
 * classifier already drops it. Manage described itself as "a filtered presentation" and filtered
 * nothing.
 */

describe("Manage offers only actions an operator can actually run", () => {
    it("drops the internal umbrella that fails on target_state", () => {
        const menu = buildSubjectManageMenuFromResolvedActions([
            action("update_lead_status", "Update Lead Status"),
            action("schedule_tour", "Schedule Tour"),
        ]);
        expect(menu.map((a) => a.key)).toEqual(["schedule_tour"]);
    });

    it("drops every umbrella the policy names, not just the one that was reported", () => {
        // A bug found on one key is a bug on all of them; fixing only the reported one leaves the
        // next operator to find the next.
        const menu = buildSubjectManageMenuFromResolvedActions(
            [...GENERIC_UMBRELLA_LIFECYCLE_ACTION_KEYS].map((k) => action(k, k))
        );
        expect(menu).toEqual([]);
    });

    it("keeps the domain verbs those umbrellas exist to serve", () => {
        // close_lead is the operator-facing verb; it supplies its own target state and must stay.
        const menu = buildSubjectManageMenuFromResolvedActions([
            action("close_lead", "Close Lead"),
            action("change_lead_location", "Change lead location"),
            action("add_child", "Add Child"),
            action("send_form", "Send Form"),
        ]);
        expect(menu.map((a) => a.key)).toEqual([
            "close_lead",
            "change_lead_location",
            "add_child",
            "send_form",
        ]);
    });

    it("still handles the empty and absent cases", () => {
        expect(buildSubjectManageMenuFromResolvedActions([])).toEqual([]);
        expect(buildSubjectManageMenuFromResolvedActions(null)).toEqual([]);
        expect(buildSubjectManageMenuFromResolvedActions(undefined)).toEqual([]);
    });
});
