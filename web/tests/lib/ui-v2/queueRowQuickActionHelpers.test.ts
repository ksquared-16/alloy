import { describe, expect, it } from "vitest";

import {
    isQueueRowBosAction,
    isQueueRowOpenAction,
    partitionQueueRowActions,
} from "@/lib/ui-v2/queueRowQuickActionHelpers";
import type { QueueItemQuickActionVm } from "@/lib/ui-v2/workspace-types";

describe("queueRowQuickActionHelpers", () => {
    it("partitions Ask BOS into dedicated button action", () => {
        const actions: QueueItemQuickActionVm[] = [
            { id: "open", label: "Open" },
            { id: "registry-ask_bos", label: "Ask BOS", actionId: "ask_bos" },
            { id: "message", label: "Message" },
        ];
        const { menuActions, bosAction } = partitionQueueRowActions(actions);
        expect(bosAction?.actionId).toBe("ask_bos");
        expect(menuActions.map((a) => a.label)).toEqual(["Message"]);
        expect(isQueueRowBosAction(bosAction!)).toBe(true);
    });

    it("excludes Open from Actions menu", () => {
        expect(isQueueRowOpenAction({ id: "open", label: "Open" })).toBe(true);
        const { menuActions } = partitionQueueRowActions([
            { id: "open", label: "Open", actionId: "open_record" },
            { id: "registry-create_lead", label: "Create Lead", actionId: "create_lead" },
        ]);
        expect(menuActions.map((a) => a.label)).toEqual(["Create Lead"]);
    });
});
