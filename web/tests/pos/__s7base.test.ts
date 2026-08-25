import { beforeAll, describe, it } from "vitest";
import fs from "node:fs"; import path from "node:path";
import { composePacket } from "@/lib/pos/packetIntake/composePacket";
import { loadCertificationPacket } from "@/lib/pos/packetIntake/loadCertificationPacket";
let inputs: any[]; let packet: any;
beforeAll(async () => { inputs = await loadCertificationPacket(path.join(process.cwd(), "tests/fixtures/processing")); packet = composePacket(inputs); }, 300_000);
describe("s7", () => { it("dumps", async () => {
    const L: string[] = [];
    const disp: Record<string, number> = {};
    for (const i of inputs) for (const p of i.discovery.proposals) disp[p.disposition] = (disp[p.disposition] ?? 0) + 1;
    L.push("DISPOSITIONS " + JSON.stringify(disp));
    L.push("destinations=" + packet.destinations.length + " obligations=" + packet.obligations.length + " correlations=" + packet.correlations.length);
    const obl: Record<string, number> = {};
    for (const o of packet.obligations) obl[o.requirement_type ?? "?"] = (obl[o.requirement_type ?? "?"] ?? 0) + 1;
    L.push("OBLIGATIONS " + JSON.stringify(obl));
    L.push("");
    L.push("=== EVERY PROPOSED NEW FIELD ===");
    for (const i of inputs) for (const p of i.discovery.proposals) {
        const c = i.discovery.concepts.find((x: any) => x.id === p.candidate_id);
        const r = p.ownership_routing;
        if (p.disposition === "create_proposed_field") L.push(`NF ${p.proposed_field.entity_type}.${p.proposed_field.suggested_field_key} :: ${JSON.stringify(c?.label)}`);
        else if (p.disposition === "held_unknown_owner") L.push(`UNK :: ${JSON.stringify(c?.label)}`);
        else if (p.disposition === "financial_payment") L.push(`FIN :: ${JSON.stringify(c?.label)}`);
        else if (p.disposition === "derived_value_system") L.push(`DER [${r?.derivedFrom}] :: ${JSON.stringify(c?.label)}`);
        else if (p.disposition === "reuse_canonical_field" && r) L.push(`BIND ${p.target_field_source?.entity_type}.${p.target_field_source?.field_key} :: ${JSON.stringify(c?.label)}`);
    }
    fs.writeFileSync("/tmp/s7base.txt", L.join("\n")+"\n");
}); });
