/**
 * Organization Calculations V1 — authenticated API QA ledger
 * Proves Create → Draft → Publish → Fork → Publish v2 → exact bind → Rebind → Archive → Restore
 *
 *   node --experimental-strip-types scripts/org-calcs-v1-api-qa.mjs
 *   (run from web/ with BASE_URL + STORAGE_STATE)
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3014";
const STORAGE =
    process.env.PLAYWRIGHT_STORAGE_STATE
    || `${process.env.HOME}/.local/state/alloy-dev/auth/slot4/storage-state.json`;
const EVIDENCE = path.resolve(
    process.cwd(),
    "../docs/sprints/07_2026/operational-calculations-product-realization/qa-evidence/org-calcs-v1",
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
    ledger.steps.push({ step: "health", status: health });

    const name = `QA Capacity ${new Date().toISOString().slice(11, 19)}`;
    const created = await api("POST", "/api/admin/organization-calculations", {
        name,
        description: "API QA — lowest of physical and licensed",
        product_type_id: "capacity_lowest_physical_licensed",
    });
    assert(created.status === 201, `create failed: ${JSON.stringify(created.json)}`);
    const calcId = created.json.calculation.id;
    ledger.steps.push({ step: "create_draft", status: created.status, id: calcId });

    const list = await api("GET", "/api/admin/organization-calculations");
    assert(list.status === 200, "list failed");
    assert(Array.isArray(list.json.product_types) && list.json.product_types.length === 2, "expected 2 product types");
    const row = list.json.calculations.find((c) => c.id === calcId);
    assert(row?.lifecycle === "draft", "expected draft lifecycle");
    assert(row?.type_label === "Capacity", "expected Capacity type_label");
    ledger.steps.push({ step: "list_product", type_label: row.type_label, status_label: row.status_label });

    const locs = await api("GET", "/api/admin/locations?hierarchy=1");
    const rooms = (locs.json.locations || []).filter(
        (l) => String(l.location_type || "").toLowerCase() === "unit",
    );
    assert(rooms.length > 0, "no rooms for evaluate");
    const roomId = rooms[0].id;

    const evalDraft = await api("POST", `/api/admin/organization-calculations/${calcId}/evaluate`, {
        roomId,
        effectiveAt: "2026-06-01",
        version: "draft",
    });
    assert(evalDraft.status === 200, `evaluate failed: ${JSON.stringify(evalDraft.json)}`);
    ledger.steps.push({
        step: "evaluate_draft",
        status: evalDraft.json.evaluation?.status,
        value: evalDraft.json.evaluation?.value,
        explanationCount: evalDraft.json.explanationLines?.length ?? 0,
    });

    const pub1 = await api("POST", `/api/admin/organization-calculations/${calcId}/publish`);
    assert(pub1.status === 200, `publish v1 failed: ${JSON.stringify(pub1.json)}`);
    const v1 = pub1.json.version?.id || pub1.json.publishedVersion?.id;
    ledger.steps.push({ step: "publish_v1", status: pub1.status, version: pub1.json.version?.version_number });

    const detail1 = await api("GET", `/api/admin/organization-calculations/${calcId}`);
    const publishedV1 = detail1.json.versions.find((v) => v.version_number === 1 && v.immutable);
    assert(publishedV1, "missing published v1");

    const bind1 = await api("POST", `/api/admin/organization-calculations/${calcId}/bind-runtime`, {
        versionId: publishedV1.id,
    });
    assert(bind1.status === 200, `bind v1 failed: ${JSON.stringify(bind1.json)}`);
    ledger.steps.push({ step: "bind_v1", status: bind1.status });

    const fork = await api("PATCH", `/api/admin/organization-calculations/${calcId}`, {
        expression_ast: detail1.json.publishedVersion?.expression_ast || detail1.json.versions[0].expression_ast,
    });
    assert(fork.status === 200, `fork failed: ${JSON.stringify(fork.json)}`);
    ledger.steps.push({ step: "fork_draft", status: fork.status });

    const pub2 = await api("POST", `/api/admin/organization-calculations/${calcId}/publish`);
    assert(pub2.status === 200, `publish v2 failed: ${JSON.stringify(pub2.json)}`);
    ledger.steps.push({ step: "publish_v2", version: pub2.json.version?.version_number });

    const runtimeV1 = await api(
        "GET",
        `/api/admin/organization-calculations/runtime?roomId=${encodeURIComponent(roomId)}&effectiveAt=2026-06-01`,
    );
    assert(runtimeV1.status === 200, "runtime failed");
    const bound = (runtimeV1.json.results || []).find((r) => r.calculation.id === calcId);
    assert(bound?.version?.version_number === 1, `expected exact v1 bind, got ${bound?.version?.version_number}`);
    ledger.steps.push({ step: "runtime_still_v1", version: bound.version.version_number, value: bound.evaluation?.value });

    const detail2 = await api("GET", `/api/admin/organization-calculations/${calcId}`);
    const publishedV2 = detail2.json.versions.find((v) => v.version_number === 2 && v.immutable);
    assert(publishedV2, "missing published v2");
    const bind2 = await api("POST", `/api/admin/organization-calculations/${calcId}/bind-runtime`, {
        versionId: publishedV2.id,
    });
    assert(bind2.status === 200, `rebind v2 failed: ${JSON.stringify(bind2.json)}`);
    ledger.steps.push({ step: "rebind_v2", status: bind2.status });

    const runtimeV2 = await api(
        "GET",
        `/api/admin/organization-calculations/runtime?roomId=${encodeURIComponent(roomId)}&effectiveAt=2026-06-01`,
    );
    const rebound = (runtimeV2.json.results || []).find((r) => r.calculation.id === calcId);
    assert(rebound?.version?.version_number === 2, "expected v2 after rebind");
    ledger.steps.push({ step: "runtime_v2", version: rebound.version.version_number });

    const bad = await api("POST", `/api/admin/organization-calculations/${calcId}/evaluate`, {
        roomId: "00000000-0000-0000-0000-000000000099",
        effectiveAt: "2026-06-01",
        version: "published",
    });
    assert(bad.status >= 400, "expected invalid room rejection");
    ledger.steps.push({ step: "invalid_room", status: bad.status, error: bad.json.error });

    const arch = await api("POST", `/api/admin/organization-calculations/${calcId}/archive`);
    assert(arch.status === 200, `archive failed: ${JSON.stringify(arch.json)}`);
    const afterArch = await api(
        "GET",
        `/api/admin/organization-calculations/runtime?roomId=${encodeURIComponent(roomId)}&effectiveAt=2026-06-01`,
    );
    const stillThere = (afterArch.json.results || []).find((r) => r.calculation.id === calcId);
    assert(!stillThere, "archived calc should leave runtime");
    ledger.steps.push({ step: "archive", ok: true });

    const restore = await api("POST", `/api/admin/organization-calculations/${calcId}/restore`);
    assert(restore.status === 200, `restore failed: ${JSON.stringify(restore.json)}`);
    assert(restore.json.calculation?.lifecycle === "published", "restore should return published");
    ledger.steps.push({ step: "restore", lifecycle: restore.json.calculation.lifecycle });

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
