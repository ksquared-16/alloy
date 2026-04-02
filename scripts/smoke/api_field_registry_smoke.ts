/**
 * Batch 2 — Field registry / API normalization smoke (admin cookie auth).
 *
 * Run against staging (or local Next):
 *   FIELD_REGISTRY_SMOKE_BASE_URL=https://your-staging.example \
 *   FIELD_REGISTRY_SMOKE_ADMIN_COOKIE='sb-access-token=...' \  # full Cookie header from browser devtools
 *   FIELD_REGISTRY_SMOKE_CUSTOMER_ID=... \
 *   FIELD_REGISTRY_SMOKE_JOB_ID=... \
 *   FIELD_REGISTRY_SMOKE_PERSON_ID=... \
 *   FIELD_REGISTRY_SMOKE_OPPORTUNITY_ID=... \
 *   FIELD_REGISTRY_SMOKE_LOCATION_ID=... \
 *   FIELD_REGISTRY_SMOKE_CUSTOM_FIELD_KEY=some_custom_text_field \  # optional: person entity custom key
 *   npm run smoke:field-registry-api
 *
 * From repo root (uses tsx via npx).
 */

const BASE =
    process.env.FIELD_REGISTRY_SMOKE_BASE_URL?.replace(/\/$/, "") ||
    process.env.SMOKE_WEB_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3000";

const COOKIE = process.env.FIELD_REGISTRY_SMOKE_ADMIN_COOKIE?.trim();

const CUSTOM_FIELD_KEY = process.env.FIELD_REGISTRY_SMOKE_CUSTOM_FIELD_KEY?.trim();

function smokePersonId(): string | undefined {
    return process.env.FIELD_REGISTRY_SMOKE_PERSON_ID?.trim();
}

const RECORD_KEYS: Record<string, string> = {
    customers: "customer_number",
    jobs: "job_number",
    persons: "person_number",
    opportunities: "opportunity_number",
    locations: "location_number",
};

/** FK columns expected on `_relationship_displays` (value may be null). */
const REL_KEYS: Record<string, string[]> = {
    customers: ["primary_contact_id"],
    jobs: ["customer_id", "location_id", "opportunity_id", "assigned_vendor_id", "primary_person_id", "primary_contact_id"],
    persons: [],
    opportunities: ["customer_id", "location_id", "primary_person_id", "primary_contact_id"],
    locations: ["customer_id", "vendor_id"],
};

function assert(cond: boolean, msg: string): asserts cond {
    if (!cond) throw new Error(msg);
}

async function api(path: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
    const headers = new Headers(init?.headers);
    if (COOKIE) headers.set("Cookie", COOKIE);
    if (init?.body != null && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const res = await fetch(`${BASE}${path.startsWith("/") ? path : `/${path}`}`, {
        ...init,
        headers,
    });
    let json: unknown = null;
    try {
        json = await res.json();
    } catch {
        /* empty */
    }
    return { status: res.status, json };
}

function recordNumberOk(drawerType: string, row: Record<string, unknown>): boolean {
    const key = RECORD_KEYS[drawerType];
    if (!key) return false;
    const v = row[key];
    if (v === null || v === undefined) return false;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "string") return v.trim() !== "" && Number.isFinite(Number(v));
    return true;
}

async function runEntityGetChecks(): Promise<void> {
    const entries: { envSuffix: string; drawerType: string }[] = [
        { envSuffix: "CUSTOMER", drawerType: "customers" },
        { envSuffix: "JOB", drawerType: "jobs" },
        { envSuffix: "PERSON", drawerType: "persons" },
        { envSuffix: "OPPORTUNITY", drawerType: "opportunities" },
        { envSuffix: "LOCATION", drawerType: "locations" },
    ];

    for (const { envSuffix, drawerType } of entries) {
        const id = process.env[`FIELD_REGISTRY_SMOKE_${envSuffix}_ID`]?.trim();
        if (!id) {
            console.warn(`[skip] ${drawerType}: set FIELD_REGISTRY_SMOKE_${envSuffix}_ID`);
            continue;
        }
        const path = `/api/admin/entity/${drawerType}/${id}`;
        const { status, json } = await api(path);
        assert(status === 200, `${path} expected 200, got ${status}: ${JSON.stringify(json)}`);
        const row = json as Record<string, unknown>;
        assert(recordNumberOk(drawerType, row), `${path}: expected native ${RECORD_KEYS[drawerType]}`);
        assert(Array.isArray(row._field_definitions), `${path}: _field_definitions must be an array`);
        assert(
            (row._field_definitions as unknown[]).length >= 1,
            `${path}: expected at least one field_definition (registry empty?)`
        );

        const rel = row._relationship_displays;
        assert(rel != null && typeof rel === "object", `${path}: _relationship_displays must be an object`);
        const expectedKeys = REL_KEYS[drawerType] ?? [];
        for (const k of expectedKeys) {
            assert(k in (rel as object), `${path}: _relationship_displays missing key ${k}`);
        }
        console.log(`[ok] GET ${drawerType}/${id.slice(0, 8)}… record# ${row[RECORD_KEYS[drawerType]]}`);
    }
}

async function runPersonPatchRoundTrip(): Promise<void> {
    const personId = smokePersonId();
    assert(!!personId, "FIELD_REGISTRY_SMOKE_PERSON_ID required for PATCH smoke");

    const getPath = `/api/admin/entity/persons/${personId}`;
    const { status: g1, json: j1 } = await api(getPath);
    assert(g1 === 200, `GET person before patch: ${g1}`);

    const before = j1 as Record<string, unknown>;
    const originalPhone =
        before.phone === null || before.phone === undefined ? "" : String(before.phone);

    const marker = `smoke-${Date.now().toString(36)}`;
    const newPhone = originalPhone ? `${originalPhone} ${marker}` : marker;

    const patchRes = await api(`/api/admin/persons/${personId}`, {
        method: "PATCH",
        body: JSON.stringify({ phone: newPhone }),
    });
    assert(patchRes.status === 200, `PATCH person system phone: ${patchRes.status} ${JSON.stringify(patchRes.json)}`);

    const { status: g2, json: j2 } = await api(getPath);
    assert(g2 === 200, "GET person after system PATCH");
    assert(String((j2 as Record<string, unknown>).phone) === newPhone, "system phone not persisted on entity GET");

    await api(`/api/admin/persons/${personId}`, {
        method: "PATCH",
        body: JSON.stringify({ phone: originalPhone || null }),
    });

    if (CUSTOM_FIELD_KEY) {
        const priorCustom = String((before[CUSTOM_FIELD_KEY] as unknown) ?? "");
        const customVal = `batch2-smoke-${Date.now()}`;
        const p1 = await api(`/api/admin/persons/${personId}`, {
            method: "PATCH",
            body: JSON.stringify({ [CUSTOM_FIELD_KEY]: customVal }),
        });
        assert(p1.status === 200, `PATCH person custom ${CUSTOM_FIELD_KEY}: ${p1.status} ${JSON.stringify(p1.json)}`);

        const { status: g3, json: j3 } = await api(getPath);
        assert(g3 === 200, "GET person after custom PATCH");
        const after = j3 as Record<string, unknown>;
        const seen = after[CUSTOM_FIELD_KEY];
        assert(
            String(seen ?? "") === customVal,
            `custom field ${CUSTOM_FIELD_KEY} not on entity GET (got ${JSON.stringify(seen)})`
        );
        await api(`/api/admin/persons/${personId}`, {
            method: "PATCH",
            body: JSON.stringify({ [CUSTOM_FIELD_KEY]: priorCustom }),
        });
        console.log(`[ok] PATCH custom field ${CUSTOM_FIELD_KEY} round-trip`);
    } else {
        console.warn("[skip] custom field PATCH: set FIELD_REGISTRY_SMOKE_CUSTOM_FIELD_KEY (person entity, is_system=false)");
    }

    console.log("[ok] PATCH system field (phone) round-trip");
}

async function main(): Promise<void> {
    if (!COOKIE) {
        console.error("FIELD_REGISTRY_SMOKE_ADMIN_COOKIE is required (full Cookie header for an admin session).");
        process.exit(1);
    }

    console.log(`Base URL: ${BASE}`);
    await runEntityGetChecks();
    await runPersonPatchRoundTrip();
    console.log("All smoke checks passed.");
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
