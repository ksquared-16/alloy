/**
 * W7-F010 DEPLOYED PROOF — the QA login's own session, through the deployed project's real PostgREST,
 * cannot write money tables or call the caller-less definer functions; it can still read.
 *
 * The access token comes from the deployed QA session's cookie and the anon key from the deployed client
 * bundle (public by design). Neither is ever logged. Every write is aimed at an id that does not exist,
 * so even a regression could not change a real row; a privilege refusal fires before any row is matched.
 * Results: `${OUT}/f010-deployed.json`.
 */
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = process.env.W7_OUT || "/tmp/w7-f010";
const BASE = "https://staging.workwithalloy.com";

function sessionAccessToken(): { projectRef: string; token: string } {
    const state = JSON.parse(readFileSync(STORAGE, "utf8")) as { cookies: Array<{ name: string; value: string }> };
    const parts = state.cookies.filter((c) => /^sb-[a-z0-9]+-auth-token(\.\d+)?$/.test(c.name))
        .sort((a, b) => a.name.localeCompare(b.name));
    const projectRef = parts[0]!.name.match(/^sb-([a-z0-9]+)-auth-token/)![1]!;
    let raw = parts.map((p) => p.value).join("");
    if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
    const token = (JSON.parse(raw) as { access_token: string }).access_token;
    return { projectRef, token };
}

async function deployedAnonKey(projectRef: string): Promise<string> {
    const html = await (await fetch(`${BASE}/login`)).text();
    const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]))];
    for (const path of chunks) {
        const js = await (await fetch(`${BASE}${path}`)).text();
        for (const m of js.matchAll(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
            try {
                const payload = JSON.parse(Buffer.from(m[0].split(".")[1]!, "base64url").toString("utf8")) as { role?: string; ref?: string };
                if (payload.role === "anon" && payload.ref === projectRef) return m[0];
            } catch {
                /* not a JWT */
            }
        }
    }
    throw new Error("anon key not found in the deployed bundle");
}

test("W7-F010 — deployed: a signed-in session cannot write money tables", async () => {
    test.setTimeout(240_000);
    const build = (await (await fetch(`${BASE}/api/build-info`)).json()) as { gitSha: string };
    const { projectRef, token } = sessionAccessToken();
    const anon = await deployedAnonKey(projectRef);
    const rest = `https://${projectRef}.supabase.co/rest/v1`;
    const headers = { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=minimal" };
    const call = async (label: string, method: string, path: string, body?: unknown) => {
        const res = await fetch(`${rest}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await res.text();
        let code: string | null = null;
        try { code = (JSON.parse(text) as { code?: string }).code ?? null; } catch { /* empty */ }
        return { label, status: res.status, code, message: text.slice(0, 160) };
    };
    const ghost = randomUUID();
    const probes = [
        await call("insert charge (posted)", "POST", "/charges", { id: ghost, status: "posted", amount_cents: 4000 }),
        await call("update charge draft->posted", "PATCH", `/charges?id=eq.${ghost}`, { status: "posted" }),
        await call("update charge amount", "PATCH", `/charges?id=eq.${ghost}`, { amount_cents: 1 }),
        await call("insert payment", "POST", "/payments", { id: ghost, amount_cents: 100 }),
        await call("update resolved_obligations", "PATCH", `/resolved_obligations?id=eq.${ghost}`, { status: "posted" }),
        await call("rpc stamp_payment_posted_to_ledger_at", "POST", "/rpc/stamp_payment_posted_to_ledger_at", { payment_id: ghost }),
        await call("rpc post_ledger_transaction", "POST", "/rpc/post_ledger_transaction", { p_ledger_tx_id: ghost }),
    ];
    const read = await call("read charges", "GET", "/charges?select=id&limit=1");
    writeFileSync(`${OUT}/f010-deployed.json`, JSON.stringify({ build: build.gitSha, projectRef, probes, read }, null, 2));
    console.log(JSON.stringify({ build: build.gitSha, probes: probes.map((p) => [p.label, p.status, p.code]), read: [read.status, read.code] })); // eslint-disable-line no-console

    for (const p of probes) {
        expect([401, 403], `${p.label}: ${p.status} ${p.message}`).toContain(p.status);
        expect(p.code, p.label).toBe("42501");
    }
    expect(read.status).toBe(200);
});
