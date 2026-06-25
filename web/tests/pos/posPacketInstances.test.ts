import { describe, it, expect } from "vitest";
import { groupSharesIntoInstances, type PosPacketShareRow } from "@/lib/pos/packet/posPacketReadModel";

function share(over: Partial<PosPacketShareRow> & Pick<PosPacketShareRow, "link_id">): PosPacketShareRow {
    return {
        token_prefix: "tok",
        child_id: null,
        recipient_id: null,
        child_label: null,
        recipient_label: null,
        recipient_email: null,
        recipient_phone: null,
        is_active: true,
        expired: false,
        opened: false,
        submitted: false,
        created_at: "2026-06-23T00:00:00Z",
        packet_instance_id: null,
        selected_child_ids: [],
        selected_child_labels: [],
        ...over,
    };
}

describe("groupSharesIntoInstances", () => {
    it("groups two recipient links of the same instance into ONE family card", () => {
        const instances = groupSharesIntoInstances([
            share({ link_id: "l1", packet_instance_id: "inst-1", recipient_label: "Justin", selected_child_labels: ["McKenzie", "Emyrson"], submitted: true }),
            share({ link_id: "l2", packet_instance_id: "inst-1", recipient_label: "Molly", selected_child_labels: ["McKenzie", "Emyrson"] }),
        ]);
        expect(instances).toHaveLength(1);
        expect(instances[0].packet_instance_id).toBe("inst-1");
        expect(instances[0].child_labels).toEqual(["McKenzie", "Emyrson"]);
        expect(instances[0].recipient_count).toBe(2);
        expect(instances[0].recipients.map((r) => r.recipient_label)).toEqual(["Justin", "Molly"]);
        // signatures placeholder: submitted recipients / total
        expect(instances[0].signatures).toEqual({ signed: 1, total: 2 });
    });

    it("legacy links (no instance) stand alone as separate cards", () => {
        const instances = groupSharesIntoInstances([
            share({ link_id: "old1", packet_instance_id: null }),
            share({ link_id: "old2", packet_instance_id: null }),
        ]);
        expect(instances).toHaveLength(2);
        expect(instances.every((i) => i.recipient_count === 1)).toBe(true);
    });

    it("preserves first-seen order", () => {
        const instances = groupSharesIntoInstances([
            share({ link_id: "a", packet_instance_id: "i2" }),
            share({ link_id: "b", packet_instance_id: "i1" }),
            share({ link_id: "c", packet_instance_id: "i2" }),
        ]);
        expect(instances.map((i) => i.packet_instance_id)).toEqual(["i2", "i1"]);
    });
});
