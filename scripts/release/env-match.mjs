#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EQUAL_FLAGS, loadPolicy } from "./env-match-policy.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const validKey = (key) => typeof key === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,255}$/.test(key);

// Drop every value immediately; retain hashes only for the explicit non-secret flag list.
export function nameRecords(entries, platform, readable = () => true) {
    if (!Array.isArray(entries)) throw new Error("Invalid variable list");
    const records = new Map();
    for (const entry of entries) {
        const key = typeof entry === "string" ? entry : entry?.key;
        if (!validKey(key) || records.has(key)) throw new Error("Invalid or duplicate variable name");
        const hash = platform === "vercel" && EQUAL_FLAGS.includes(key) && readable(entry) && typeof entry.value === "string"
            ? sha256(entry.value) : null;
        records.set(key, hash);
    }
    return records;
}

export function compare(production, staging, policy = loadPolicy()) {
    let problems = 0;
    const details = [];
    for (const platform of ["vercel", "render"]) {
        const prod = production[platform];
        const stage = staging[platform];
        const rules = policy[platform];
        details.push(`${platform}:`);
        const list = (label, keys, unexpected = true) => {
            details.push(`  ${label}: ${keys.sort().join(", ") || "none"}`);
            if (unexpected) problems += keys.length;
        };
        list("production outside allowlist", [...prod.keys()].filter((k) => !rules.allowed.includes(k)));
        list("required production missing", rules.required.filter((k) => !prod.has(k)));
        const onlyStage = [...stage.keys()].filter((k) => !prod.has(k));
        list("staging-only expected", onlyStage.filter((k) => rules.stagingOnly.includes(k)), false);
        list("staging-only unexpected", onlyStage.filter((k) => !rules.stagingOnly.includes(k)));
        for (const key of rules.equalFlags) {
            if (!prod.has(key) && !stage.has(key)) continue;
            if (!prod.has(key) || !stage.has(key)) {
                details.push(`  flag ${key}: differs (presence)`);
                // Staging-only has already been counted above.
                if (prod.has(key)) problems++;
            } else if (!prod.get(key) || !stage.get(key)) {
                details.push(`  flag ${key}: unavailable (comparison incomplete)`);
                problems++;
            } else {
                const equal = prod.get(key) === stage.get(key);
                details.push(`  flag ${key}: ${equal ? "equal" : "differs"}`);
                if (!equal) problems++;
            }
        }
    }
    return { code: problems ? 1 : 0, text: `Environment match: ${problems ? "FAIL" : "PASS"} (${problems} unexpected findings).\n${details.join("\n")}\n` };
}

async function getJson(url, token, fetchImpl) {
    const response = await fetchImpl(url, {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error("API request failed");
    return response.json();
}

export async function fetchVercel(options, token, fetchImpl) {
    const url = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(options["vercel-project"])}/env`);
    if (options["vercel-team"]) url.searchParams.set("teamId", options["vercel-team"]);
    // No bulk decryption: only explicitly readable non-secret flags can be hashed.
    const data = await getJson(url, token, fetchImpl);
    if (!Array.isArray(data.envs)) throw new Error("Invalid Vercel response");
    const select = async (target) => {
        const base = new Map();
        const overrides = new Map();
        for (const row of data.envs) {
            if (!Array.isArray(row.target) || !validKey(row.key)) throw new Error("Invalid Vercel row");
            if (!row.target.includes(target)) continue;
            if (row.gitBranch && (target !== "preview" || row.gitBranch !== options["staging-branch"])) continue;
            const map = row.gitBranch ? overrides : base;
            if (map.has(row.key)) throw new Error("Ambiguous Vercel scope");
            map.set(row.key, row);
        }
        const selected = [...new Map([...base, ...overrides]).values()];
        for (const row of selected) {
            if (!EQUAL_FLAGS.includes(row.key) || row.type !== "encrypted" || row.decrypted === true || !row.id) continue;
            const flagUrl = new URL(`https://api.vercel.com/v1/projects/${encodeURIComponent(options["vercel-project"])}/env/${encodeURIComponent(row.id)}`);
            if (options["vercel-team"]) flagUrl.searchParams.set("teamId", options["vercel-team"]);
            try {
                const flag = await getJson(flagUrl, token, fetchImpl);
                if (flag.key === row.key && flag.decrypted === true && typeof flag.value === "string") {
                    row.value = flag.value;
                    row.decrypted = true;
                }
            } catch { /* Names still work; the flag will be reported unavailable. */ }
        }
        return nameRecords(selected, "vercel",
            (row) => row.type === "plain" || row.decrypted === true);
    };
    return { production: await select("production"), staging: await select("preview") };
}

export async function fetchRender(service, token, fetchImpl) {
    const records = new Map();
    const cursors = new Set();
    let cursor;
    for (let page = 0; page < 1000; page++) {
        const url = new URL(`https://api.render.com/v1/services/${encodeURIComponent(service)}/env-vars`);
        url.searchParams.set("limit", "100");
        if (cursor) url.searchParams.set("cursor", cursor);
        const data = await getJson(url, token, fetchImpl);
        if (!Array.isArray(data)) throw new Error("Invalid Render response");
        const batch = nameRecords(data.map((row) => row.envVar), "render");
        for (const [key, hash] of batch) {
            if (records.has(key)) throw new Error("Duplicate Render key");
            records.set(key, hash);
        }
        if (data.length < 100) return records;
        cursor = data.at(-1).cursor;
        if (typeof cursor !== "string" || !cursor || cursors.has(cursor)) throw new Error("Invalid Render pagination");
        cursors.add(cursor);
    }
    throw new Error("Render pagination limit");
}

const HELP = `Usage:
  node scripts/release/env-match.mjs --offline production.json staging.json
  node scripts/release/env-match.mjs --vercel-project ID --vercel-team ID --render-production ID --render-staging ID [--staging-branch staging]
Tokens: VERCEL_TOKEN and RENDER_API_KEY, supplied only through the environment.
Offline JSON: { "vercel": ["KEY"], "render": ["KEY"] }; synthetic flag fixtures may use { "key": "KEY", "value": "..." }.
See scripts/release/env-match.md for scope and API limitations.
`;

export async function run(args, { env = {}, fetchImpl = globalThis.fetch, read = (path) => readFileSync(path, "utf8") } = {}) {
    try {
        if (args.length === 1 && args[0] === "--help") return { code: 0, text: HELP };
        let production, staging;
        let live = false;
        if (args[0] === "--offline") {
            if (args.length !== 3) throw new Error("Invalid arguments");
            [production, staging] = args.slice(1).map((path) => {
                const data = JSON.parse(read(path));
                return { vercel: nameRecords(data.vercel, "vercel"), render: nameRecords(data.render, "render") };
            });
        } else {
            const options = { "staging-branch": "staging" };
            const allowed = ["vercel-project", "vercel-team", "render-production", "render-staging", "staging-branch"];
            const seen = new Set();
            for (let i = 0; i < args.length; i += 2) {
                const key = args[i].slice(2);
                if (!args[i].startsWith("--") || !allowed.includes(key) || seen.has(key) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Invalid arguments");
                seen.add(key);
                options[key] = args[i + 1];
            }
            if (!["vercel-project", "render-production", "render-staging"].every((key) => options[key]) || !env.VERCEL_TOKEN || !env.RENDER_API_KEY) throw new Error("Missing configuration");
            if (options["render-production"] === options["render-staging"]) throw new Error("Same Render service");
            const vercel = await fetchVercel(options, env.VERCEL_TOKEN, fetchImpl);
            production = { vercel: vercel.production, render: await fetchRender(options["render-production"], env.RENDER_API_KEY, fetchImpl) };
            staging = { vercel: vercel.staging, render: await fetchRender(options["render-staging"], env.RENDER_API_KEY, fetchImpl) };
            live = true;
        }
        const result = compare(production, staging);
        if (live) result.text += "Scope: Vercel project variables; Render direct service variables only (linked environment groups excluded).\n";
        return result;
    } catch {
        // Never echo exception messages, API bodies, URLs, paths, arguments, tokens or values.
        return { code: 1, text: "Environment match: FAIL (check incomplete).\nUnable to read configuration or API variable lists. Check arguments, fixture format, token access and API availability. No values are shown.\n" };
    }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = await run(process.argv.slice(2), { env: process.env });
    process.stdout.write(result.text);
    process.exitCode = result.code;
}
