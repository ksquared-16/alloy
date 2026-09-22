/**
 * THE HEADER KPI SET IS CONFIGURATION, NOT ARCHITECTURE.
 *
 * Three numerals are what the deployed header happens to publish today. They are not the contract.
 * The contract is that the metric set is DERIVED from published configuration, that a seed can only
 * answer the configuration it was resolved for, and that a configured key this build cannot compute
 * says so terminally instead of reserving geometry forever.
 *
 * Every specimen below is built from a CONFIGURATION FIXTURE and asserted against the CONFIGURATION,
 * never against a remembered key set. That is deliberate: a gate holding its own copy of "the three
 * keys" is a second hardcoded list, and it would pass unchanged on the day configuration moves —
 * which is the exact failure this contract exists to prevent. Where a real registry key is needed,
 * it is taken from `listMetricDefinitions()` at runtime, so the fixtures follow the registry rather
 * than pinning it.
 */
import { describe, expect, it } from "vitest";

import { listMetricDefinitions } from "@/lib/metrics/registry";
import { buildOipWarmScopeKey } from "@/lib/metrics/oipWorkspaceWarmCache";
import { workUnitHeaderKpiKeysFromSlots } from "@/lib/runtime/provisioning/workUnitHeaderKpiResolution";
import { headerKpiVmFromConfiguredSlot } from "@/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot";
import type { OperationalKpiSlot } from "@/lib/runtime/provisioning/operationalPresentation";

/** Real registry keys, taken from the registry — never transcribed into this file. */
const REGISTRY_KEYS = listMetricDefinitions().map((d) => d.key);
const [K1, K2, K3, K4] = REGISTRY_KEYS;

/** A published header slot. `enabled` filtering happens upstream; these are the survivors. */
const slot = (n: number, sourceKey: string | null): OperationalKpiSlot =>
    ({ slot: n, label: `slot ${n}`, icon: null, accent: null, sourceKey }) as OperationalKpiSlot;

/** A configuration is a list of slots. These are the A–H specimens, as data. */
const config = (...keys: (string | null)[]) => keys.map((k, i) => slot(i + 1, k));

describe("the configured set is derived, never assumed", () => {
    it("names exactly the keys configuration published — at any cardinality", () => {
        // Deliberately walks cardinalities around today's, so a gate cannot encode 'three'.
        for (const n of [1, 2, 3, 4, 5]) {
            const keys = REGISTRY_KEYS.slice(0, n);
            expect(workUnitHeaderKpiKeysFromSlots(config(...keys))).toEqual([...keys].sort());
        }
    });

    it("SPECIMEN A — a metric REMOVED from configuration leaves the derived set", () => {
        const before = workUnitHeaderKpiKeysFromSlots(config(K1, K2, K3));
        const after = workUnitHeaderKpiKeysFromSlots(config(K1, K3));
        expect(before).toContain(K2);
        expect(after).not.toContain(K2);
        expect(after).toEqual([K1, K3].sort());
    });

    it("SPECIMEN B — a metric ADDED to configuration enters the derived set", () => {
        const before = workUnitHeaderKpiKeysFromSlots(config(K1, K2));
        const after = workUnitHeaderKpiKeysFromSlots(config(K1, K2, K4));
        expect(before).not.toContain(K4);
        expect(after).toContain(K4);
    });

    it("SPECIMEN C — REORDERING configuration changes no value binding", () => {
        // The derived set is order-free, and the merge binds by key. Reordering the header must
        // therefore move labels, never numbers — the failure mode being slot-positional binding,
        // which would silently show one metric's value under another's label.
        expect(workUnitHeaderKpiKeysFromSlots(config(K3, K1, K2))).toEqual(
            workUnitHeaderKpiKeysFromSlots(config(K1, K2, K3)),
        );
    });

    it("does not fabricate a set when configuration publishes none", () => {
        expect(workUnitHeaderKpiKeysFromSlots([])).toEqual([]);
        expect(workUnitHeaderKpiKeysFromSlots(config(null))).toEqual([]);
    });
});

describe("seed identity carries configuration identity", () => {
    const scope = (keys: string[]) =>
        buildOipWarmScopeKey({ siteId: "site-1", workUnitId: "wu-1", keys: keys as never });

    it("SPECIMEN G — a seed resolved for configuration N cannot answer configuration N+1", () => {
        const n = workUnitHeaderKpiKeysFromSlots(config(K1, K2, K3));
        for (const next of [config(K1, K2), config(K1, K2, K3, K4), config(K1, K2, K4)]) {
            const nPlus1 = workUnitHeaderKpiKeysFromSlots(next);
            expect(scope([...nPlus1])).not.toBe(scope([...n]));
        }
    });

    it("SPECIMEN H — the same set under a different scope is still a different identity", () => {
        const keys = [...workUnitHeaderKpiKeysFromSlots(config(K1, K2))];
        expect(buildOipWarmScopeKey({ siteId: "site-1", workUnitId: "wu-1", keys: keys as never })).not.toBe(
            buildOipWarmScopeKey({ siteId: "site-2", workUnitId: "wu-1", keys: keys as never }),
        );
    });

    it("a REORDERED configuration keeps its identity — it is the same answer", () => {
        expect(scope([...workUnitHeaderKpiKeysFromSlots(config(K3, K1, K2))])).toBe(
            scope([...workUnitHeaderKpiKeysFromSlots(config(K1, K2, K3))]),
        );
    });
});

describe("a configured key this build cannot answer is truthful, not eternally pending", () => {
    it("reserves a supported configured key, as the settlement contract requires", () => {
        const vm = headerKpiVmFromConfiguredSlot(slot(1, K1));
        expect(vm.pending).toBe(true);
        expect(vm.formattedValue).toBe("");
    });

    it("SPECIMEN B (unsupported) — a key absent from the registry settles unavailable", () => {
        // Both key derivations filter unknown keys BEFORE the request, so this slot is never asked
        // for and the merge never touches it. Left pending it would reserve forever under a KPI
        // region reporting `resolved`. It must terminate instead.
        const vm = headerKpiVmFromConfiguredSlot(slot(1, "enrollment.not_a_real_metric"));
        expect(vm.pending).toBe(false);
        expect(vm.formattedValue).toBe("—");
        // Not zero. An unsupported metric must never read as a measured nothing.
        expect(vm.formattedValue).not.toBe("0");
    });

    it("an enabled slot publishing NO source key also terminates", () => {
        const vm = headerKpiVmFromConfiguredSlot(slot(1, null));
        expect(vm.pending).toBe(false);
        expect(vm.formattedValue).toBe("—");
    });

    it("the slot is never dropped — configured geometry survives unanswerability", () => {
        const vm = headerKpiVmFromConfiguredSlot(slot(7, "  "));
        expect(vm.slot).toBe(7);
        expect(vm.label).toBe("slot 7");
    });

    it("every key the registry defines is answerable", () => {
        for (const key of REGISTRY_KEYS) {
            expect(headerKpiVmFromConfiguredSlot(slot(1, key)).pending).toBe(true);
        }
    });
});
