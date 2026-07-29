const fs = require("fs");
const path = require("path");

const STORAGE = path.join(process.env.HOME, ".local/state/alloy-dev/auth/slot4/storage-state.json");
const state = JSON.parse(fs.readFileSync(STORAGE, "utf8"));
const cookies = (state.cookies || []).map((c) => `${c.name}=${c.value}`).join("; ");
const BASE = process.env.ORG_CALC_BASE || "http://127.0.0.1:3014";
const evidence = path.resolve(
  __dirname,
  "../docs/sprints/07_2026/operational-calculations-product-realization/qa-evidence/org-calcs",
);
fs.mkdirSync(evidence, { recursive: true });

async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      Cookie: cookies,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 800) };
  }
  return { status: res.status, json };
}

(async () => {
  const log = [];
  const step = (m, d) => {
    console.log(JSON.stringify({ m, d }));
    log.push({ m, d });
  };

  const locs = await api("GET", "/api/admin/locations?hierarchy=1");
  step("locations", { status: locs.status, count: locs.json.locations?.length, err: locs.json.error });
  if (locs.status !== 200) throw new Error("locations failed");
  const units = (locs.json.locations || []).filter((l) => String(l.location_type).toLowerCase() === "unit");
  if (units.length < 1) throw new Error("need rooms");
  const room1 = units[0].id;
  const room2 = (units[1] || units[0]).id;
  step("rooms", { room1, room2, n: units.length, labels: units.slice(0, 2).map((u) => u.label) });

  const stamp = Date.now();
  const created = await api("POST", "/api/admin/organization-calculations", {
    name: `Effective physical–licensed seats ${stamp}`,
    key: `orgcalc.qa_proving_${stamp}`,
    description: "QA proving slice",
    expression_ast: {
      kind: "call",
      fn: "min",
      id: "root",
      args: [
        { kind: "input", ref: "capacity.room_binding.physical", id: "p" },
        { kind: "input", ref: "capacity.room_binding.licensed", id: "l" },
      ],
    },
    consumer_bindings: {},
  });
  step("create", { status: created.status, id: created.json.calculation?.id, err: created.json.error });
  if (created.status !== 201) throw new Error("create failed: " + created.json.error);
  const id = created.json.calculation.id;

  for (const [label, roomId] of [
    ["r1", room1],
    ["r2", room2],
  ]) {
    const ev = await api("POST", `/api/admin/organization-calculations/${id}/evaluate`, {
      roomId,
      effectiveAt: "2026-06-01",
      version: "draft",
    });
    step(`evaluate_${label}`, {
      status: ev.status,
      value: ev.json.evaluation?.value,
      statusEval: ev.json.evaluation?.status,
      steps: ev.json.explanationLines?.length,
      warnings: ev.json.evaluation?.warnings,
      lines: ev.json.explanationLines,
      err: ev.json.error,
    });
    if (ev.status !== 200) throw new Error("evaluate failed " + label + " " + ev.json.error);
  }

  const bad = await api("POST", `/api/admin/organization-calculations/${id}/evaluate`, {
    roomId: "00000000-0000-0000-0000-000000000099",
    effectiveAt: "2026-06-01",
    version: "draft",
  });
  step("cross_org_reject", { status: bad.status, error: bad.json.error });
  if (bad.status < 400) throw new Error("expected reject");

  const pub1 = await api("POST", `/api/admin/organization-calculations/${id}/publish`);
  step("publish_v1", {
    status: pub1.status,
    v: pub1.json.version?.version_number,
    immutable: pub1.json.version?.immutable,
    err: pub1.json.error,
  });
  if (pub1.status !== 200 || !pub1.json.version?.immutable) throw new Error("publish v1 failed");
  const v1 = pub1.json.version.id;

  const bind1 = await api("POST", `/api/admin/organization-calculations/${id}/bind-runtime`, { versionId: v1 });
  step("bind_v1", { status: bind1.status, bound: bind1.json.version?.consumer_bindings, err: bind1.json.error });
  if (bind1.status !== 200) throw new Error("bind failed " + bind1.json.error);

  const fork = await api("PATCH", `/api/admin/organization-calculations/${id}`, {
    expression_ast: {
      kind: "call",
      fn: "min",
      id: "root",
      args: [
        { kind: "input", ref: "capacity.room_binding.physical", id: "p" },
        { kind: "input", ref: "capacity.room_binding.licensed", id: "l" },
      ],
    },
  });
  step("fork_draft", { status: fork.status, draftImmutable: fork.json.version?.immutable, err: fork.json.error });
  if (fork.status !== 200 || fork.json.version?.immutable) throw new Error("fork failed");

  const pub2 = await api("POST", `/api/admin/organization-calculations/${id}/publish`);
  step("publish_v2", { status: pub2.status, v: pub2.json.version?.version_number, err: pub2.json.error });
  if (pub2.status !== 200 || pub2.json.version?.version_number !== 2) throw new Error("publish v2 failed");

  const rt = await api("GET", `/api/admin/organization-calculations/runtime?roomId=${room1}&effectiveAt=2026-06-01`);
  const mineRt = (rt.json.results || []).filter((r) => r.calculation?.id === id);
  step("runtime_after_v2", {
    status: rt.status,
    n: mineRt.length,
    version: mineRt[0]?.version?.version_number,
    value: mineRt[0]?.evaluation?.value,
    name: mineRt[0]?.calculation?.name,
    err: rt.json.error,
  });
  if (mineRt[0]?.version?.version_number !== 1) {
    throw new Error("expected still bound to v1 got " + mineRt[0]?.version?.version_number);
  }

  const detail = await api("GET", `/api/admin/organization-calculations/${id}`);
  const imm = (detail.json.versions || []).find((v) => v.version_number === 1);
  step("v1_immutable_flag", { immutable: imm?.immutable, runtime: imm?.consumer_bindings?.runtime_surface });

  const arch = await api("POST", `/api/admin/organization-calculations/${id}/archive`);
  step("archive", { status: arch.status, lifecycle: arch.json.calculation?.lifecycle, err: arch.json.error });
  const rt2 = await api("GET", `/api/admin/organization-calculations/runtime?roomId=${room1}&effectiveAt=2026-06-01`);
  const mineRt2 = (rt2.json.results || []).filter((r) => r.calculation?.id === id);
  step("runtime_after_archive", { n: mineRt2.length, total: rt2.json.results?.length ?? 0 });
  if (mineRt2.length !== 0) throw new Error("archived should leave runtime");

  fs.writeFileSync(path.join(evidence, "api-qa-ledger.json"), JSON.stringify(log, null, 2));
  console.log("API_QA_PASS");
})().catch((e) => {
  console.error("API_QA_FAIL", e);
  process.exit(1);
});
