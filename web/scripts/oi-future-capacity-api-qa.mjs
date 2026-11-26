/**
 * Future Room Capacity — authenticated API QA
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3014 \
 *   PLAYWRIGHT_STORAGE_STATE=$HOME/.local/state/alloy-dev/auth/slot4/storage-state.json \
 *   node scripts/oi-future-capacity-api-qa.mjs
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3014";
const STORAGE =
    process.env.PLAYWRIGHT_STORAGE_STATE
    || `${process.env.HOME}/.local/state/alloy-dev/auth/slot4/storage-state.json`;
const EVIDENCE = path.resolve(
    process.cwd(),
    "../docs/sprints/07_2026/operational-calculations-product-realization/qa-evidence/oi-future-capacity",
);

function cookieHeader() {
    const state = JSON.parse(fs.readFileSync(STORAGE, "utf8"));
    return (state.cookies || [])
        .filter((c) => !c.expires || c.expires * 1000 > Date.now())
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
}

async function api(method, urlPath, body) {
    const res = await fetch(`${BASE}${urlPath}`, {
        method,
        headers: {
            Cookie: cookieHeader(),
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

async function main() {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    const ledger = { base: BASE, startedAt: new Date().toISOString(), steps: [] };

    const health = await fetch(`${BASE}/login`).then((r) => r.status).catch(() => 0);
    assert(health === 200 || health === 307 || health === 302, `Server not healthy (${health})`);

    const listCalcs = await api("GET", "/api/admin/organization-calculations");
    assert(listCalcs.status === 200, "list calcs failed");
    let calc = (listCalcs.json.calculations || []).find((c) => c.lifecycle === "published");
    if (!calc) {
        const created = await api("POST", "/api/admin/organization-calculations", {
            name: `OI Future Cap ${Date.now()}`,
            product_type_id: "capacity_lowest_physical_licensed",
        });
        assert(created.status === 201, "create calc failed");
        const pub = await api("POST", `/api/admin/organization-calculations/${created.json.calculation.id}/publish`);
        assert(pub.status === 200, "publish failed");
        calc = created.json.calculation;
    }

    const detail = await api("GET", `/api/admin/organization-calculations/${calc.id}`);
    const v1 = (detail.json.versions || []).find((v) => v.immutable && v.version_number === 1)
        || (detail.json.versions || []).filter((v) => v.immutable).sort((a, b) => a.version_number - b.version_number)[0];
    assert(v1, "need published version");

    const createdM = await api("POST", "/api/admin/metrics/oi-org-calc-measurements", {
        name: "Future Room Capacity",
        description: "API QA measurement",
        calculation_id: calc.id,
        calculation_version_id: v1.id,
        target_min_seats: 18,
    });
    assert(createdM.status === 201, `create measurement failed: ${JSON.stringify(createdM.json)}`);
    const mid = createdM.json.measurement.id;
    ledger.steps.push({ step: "create_measurement", id: mid, version: v1.version_number });

    const locs = await api("GET", "/api/admin/locations?hierarchy=1");
    const rooms = (locs.json.locations || []).filter((l) => String(l.location_type || "").toLowerCase() === "unit");
    assert(rooms.length >= 1, "need rooms");
    const room1 = rooms[0].id;
    const room2 = rooms[1]?.id || rooms[0].id;

    const obs1 = await api("POST", `/api/admin/metrics/oi-org-calc-measurements/${mid}/observe`, {
        roomId: room1,
        effectiveAt: "2026-09-01",
        roomLabel: "Room 1",
    });
    assert(obs1.status === 200, `observe1 failed: ${JSON.stringify(obs1.json)}`);
    ledger.steps.push({
        step: "observe_room1",
        availability: obs1.json.observation?.availability,
        value: obs1.json.observation?.value,
        health: obs1.json.health,
        version: obs1.json.observation?.version_number,
    });

    const obs2 = await api("POST", `/api/admin/metrics/oi-org-calc-measurements/${mid}/observe`, {
        roomId: room2,
        effectiveAt: "2026-10-01",
        roomLabel: "Room 2",
    });
    assert(obs2.status === 200, `observe2 failed: ${JSON.stringify(obs2.json)}`);
    ledger.steps.push({ step: "observe_room2", availability: obs2.json.observation?.availability });

    const bad = await api("POST", `/api/admin/metrics/oi-org-calc-measurements/${mid}/observe`, {
        roomId: "00000000-0000-0000-0000-000000000099",
        effectiveAt: "2026-09-01",
    });
    assert(bad.status >= 400, "expected cross-org rejection");
    ledger.steps.push({ step: "invalid_room", status: bad.status });

    // Ensure draft exists then publish v2; binding must stay on v1
    const fork = await api("PATCH", `/api/admin/organization-calculations/${calc.id}`, {
        expression_ast: detail.json.publishedVersion?.expression_ast || detail.json.versions?.[0]?.expression_ast,
    });
    assert(fork.status === 200, "fork failed");
    const pub2 = await api("POST", `/api/admin/organization-calculations/${calc.id}/publish`);
    assert(pub2.status === 200, "publish v2 failed");

    const afterPub = await api("GET", `/api/admin/metrics/oi-org-calc-measurements/${mid}`);
    assert(afterPub.json.measurement?.source?.calculation_version_id === v1.id, "binding silently moved off v1");
    ledger.steps.push({ step: "still_bound_v1", version_id: afterPub.json.measurement.source.calculation_version_id });

    const detail2 = await api("GET", `/api/admin/organization-calculations/${calc.id}`);
    const v2 = (detail2.json.versions || []).find((v) => v.immutable && v.version_number === 2);
    if (v2) {
        const rebind = await api("PATCH", `/api/admin/metrics/oi-org-calc-measurements/${mid}`, {
            calculation_version_id: v2.id,
        });
        assert(rebind.status === 200, "rebind failed");
        assert(rebind.json.measurement.source.version_number === 2, "rebind did not update version");
        ledger.steps.push({ step: "rebind_v2", version: 2 });
    }

    const hist = await api("GET", `/api/admin/metrics/oi-org-calc-measurements/${mid}`);
    assert((hist.json.history || []).length >= 2, "expected history entries");
    ledger.steps.push({ step: "history_count", count: hist.json.history.length });

    ledger.finishedAt = new Date().toISOString();
    ledger.ok = true;
    const out = path.join(EVIDENCE, "api-qa-ledger.json");
    fs.writeFileSync(out, JSON.stringify(ledger, null, 2));
    console.log(JSON.stringify({ ok: true, out, steps: ledger.steps.length }, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
