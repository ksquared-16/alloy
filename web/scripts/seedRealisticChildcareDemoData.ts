#!/usr/bin/env npx tsx
/**
 * Realistic childcare CRM seed for an existing org (staging / demo).
 * Prerequisite: run `demo:reset:dry` then `demo:reset` execute against the same org when replacing prior demo rows.
 *
 * Flags:
 *   --scopes-only   — wire DEMO_* user roles + access only (no family/opportunity loop). Same as `npm run demo:seed:scopes`.
 *   --patch-metadata — idempotent metadata backfill for already-seeded rows (inquiry_children, tour_time, notes_at). Same as `npm run demo:seed:patch-metadata`.
 *
 * Env:
 *   DEMO_RESET_ORG_ID (required)
 *   DEMO_CORPORATE_USER_ID, DEMO_REGIONAL_USER_ID, DEMO_DIRECTOR_USER_ID (optional — updates access profiles + roles)
 *   DEMO_STAGING_TIMEZONE (optional IANA, default America/Los_Angeles) — sets org + demo user display timezones when unset
 *
 * @see docs/sprints/archive/05_2026/staging-demo-data-reset-realistic-seed.md
 *
 * Performance follow-up (135 families = many sequential round-trips):
 * - Bulk upserts / RPC batches for persons, customer_members, opportunities
 * - Staged import tables + single MERGE into core tables
 * - Batch opportunity_customer_members + quotes
 * - Background import job with progress + downloadable error report
 *
 * Demo communications: ~37% of opportunities get 1–3 canonical rows (communication_threads +
 * communication_messages) on the opportunity, mixed inbound/outbound email or SMS, timestamps after
 * created_at. Idempotent per opportunity (threads tagged metadata.demo_realistic_comm).
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import { demoSeedMetadata, STAGING_REALISTIC_CHILDCARE_SEED_PACKAGE } from "./lib/stagingDemoMarkers";
import { fromZonedTime } from "date-fns-tz";
import {
    ageGroupForProgramLabel,
    approximateAgeMonthsFromDobIso,
    programLabelAndAgeGroupFromAgeMonths,
} from "@/lib/childcare/childCareProgramFromDob";
import { __testing as queueServiceTesting } from "@/lib/queues/QueueService";
import { isValidIanaTimeZone } from "@/lib/admin/timezoneContract";
import { normalizeRecipientKeyEmail, normalizeRecipientKeySms } from "@/lib/communications/recipientKey";

const PRICED_STATUS_KEYS = new Set(["enrolled", "enrolling"]);

/** ~37% of opportunities get seeded canonical communication_threads + messages (mix inbound/outbound). */
const DEMO_COMM_SEED_PERCENT = 37;

const DEMO_COMM_MSG_META = { demo_seed_kind: "realistic_childcare_demo" } as const;

const FORBIDDEN_VISIBLE_SUBSTRINGS = ["Access Validation", "demo", "parent last name"] as const;

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const SITE_SPECS = [
    { seedKey: "site_north_campus", label: "North Campus" },
    { seedKey: "site_south_campus", label: "South Campus" },
    { seedKey: "site_west_campus", label: "West Campus" },
] as const;

const ROOM_NAMES = [
    "Infant A",
    "Infant B",
    "Toddler 1",
    "Toddler 2",
    "Preschool 1",
    "Preschool 2",
    "Pre-K",
    "School Age",
] as const;

/** Exact pipeline counts for 135 seeded opportunities (visual validation). */
const STATUS_COUNTS_FOR_135: Array<[string, number]> = [
    ["new_inquiry", 20],
    ["contact_attempted", 18],
    ["tour_scheduled", 18],
    ["tour_completed", 18],
    ["enrolling", 18],
    ["waitlisted", 12],
    ["enrolled", 18],
    ["lost", 13],
];

/** Console / validation ordering (matches targets above). */
const PIPELINE_STATUS_ORDER = STATUS_COUNTS_FOR_135.map(([k]) => k);

const NOTES_POOL = [
    "Left voicemail, will try again tomorrow afternoon.",
    "Family asked about toddler availability and part-time schedule.",
    "Tour completed; parent requested tuition estimate.",
    "Waiting on immunization records before enrollment packet can be finalized.",
    "Sibling currently attends North Campus.",
    "Family prefers start date after current lease move.",
    "Follow up on subsidy paperwork — family is gathering documents.",
    "Interested in summer-only enrollment; discussing start window.",
    "Parent requested a second tour with spouse present.",
    "Clarified fee schedule and deposit timeline on the call.",
];

const FIRST_NAMES_F = [
    "Sarah",
    "Amanda",
    "Jordan",
    "Emily",
    "Priya",
    "Olivia",
    "Maya",
    "Hannah",
    "Rachel",
    "Nina",
    "Claire",
    "Elena",
    "Sofia",
    "Grace",
    "Victoria",
];
const FIRST_NAMES_M = [
    "James",
    "Marcus",
    "David",
    "Noah",
    "Ethan",
    "Daniel",
    "Ryan",
    "Kevin",
    "Jordan",
    "Alex",
    "Chris",
    "Brian",
    "Eric",
    "Jason",
    "Tyler",
];
const LAST_NAMES = [
    "Mitchell",
    "Rivera",
    "Chen",
    "Patel",
    "Nguyen",
    "Hernandez",
    "Brooks",
    "Foster",
    "Kim",
    "Sullivan",
    "Bennett",
    "Murphy",
    "Hayes",
    "Coleman",
    "Price",
];
const CHILD_FIRST = ["Mia", "Liam", "Sophia", "Ethan", "Ava", "Lucas", "Harper", "Jackson", "Ella", "Henry", "Zoe", "Owen"];

const EMAIL_DOMAINS = ["example.com", "example.net", "testmail.local"] as const;

const PROG_LABELS = [
    "Toddler — 2–3 years",
    "Preschool — 3–4 years",
    "Pre-K — 4–5 years",
    "Infant — 0–18 months",
    "Young Toddler — 18–24 months",
    "School Age — 5+ years",
] as const;

const SEED_STRING_POOLS: ReadonlyArray<{ label: string; values: readonly string[] }> = [
    { label: "FIRST_NAMES_F", values: FIRST_NAMES_F },
    { label: "FIRST_NAMES_M", values: FIRST_NAMES_M },
    { label: "LAST_NAMES", values: LAST_NAMES },
    { label: "CHILD_FIRST", values: CHILD_FIRST },
    { label: "NOTES_POOL", values: NOTES_POOL },
    { label: "EMAIL_DOMAINS", values: EMAIL_DOMAINS },
    { label: "ROOM_NAMES", values: ROOM_NAMES },
    { label: "PROG_LABELS", values: PROG_LABELS },
];

function assertSeedStringPools(): void {
    for (const { label, values } of SEED_STRING_POOLS) {
        if (!values.length) {
            throw new Error(`Seed pool "${label}" is empty — modulo indexing would produce NaN and undefined reads.`);
        }
        values.forEach((v, idx) => {
            if (typeof v !== "string" || !v.trim()) {
                throw new Error(`Seed pool "${label}" has invalid entry at index ${idx}: ${JSON.stringify(v)}`);
            }
        });
    }
}

assertSeedStringPools();

/** Non-negative `h mod len`. JavaScript `%` keeps the dividend's sign, so negative `h` yields negative remainders and unsafe array indexes. */
function modLength(h: number, len: number): number {
    if (!Number.isFinite(len) || len <= 0) throw new Error(`modLength: invalid len=${len}`);
    if (!Number.isFinite(h)) throw new Error(`modLength: invalid h=${h}`);
    return ((h % len) + len) % len;
}

function pickPoolMod(values: readonly string[], h: number, label: string): string {
    const len = values.length;
    if (!len) throw new Error(`pickPoolMod: empty pool "${label}"`);
    const idx = modLength(h, len);
    const v = values[idx];
    if (typeof v !== "string" || !v.trim()) {
        throw new Error(`pickPoolMod: undefined/empty at ${label}[${idx}] (h=${h})`);
    }
    return v.trim();
}

function requireEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) {
        console.error(`Missing required env: ${name}`);
        process.exit(1);
    }
    return v;
}

function hash32(input: string): number {
    let h = 5381;
    for (let i = 0; i < input.length; i++) h = ((h << 5) + h) ^ input.charCodeAt(i);
    return h >>> 0;
}

/** Deterministic PRNG (32-bit state) for stable shuffles per org. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        let t = (a += 0x6d2b79f5) >>> 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function buildStatusPool135(): string[] {
    const pool: string[] = [];
    for (const [key, n] of STATUS_COUNTS_FOR_135) {
        for (let i = 0; i < n; i++) pool.push(key);
    }
    if (pool.length !== 135) {
        throw new Error(`status pool length ${pool.length} expected 135`);
    }
    return pool;
}

function deterministicShuffleStatuses(pool: string[], orgId: string): string[] {
    const a = [...pool];
    const rand = mulberry32(hash32(`staging_childcare_status_shuffle_v1:${orgId}`));
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const t = a[i]!;
        a[i] = a[j]!;
        a[j] = t;
    }
    return a;
}

function countStatuses(keys: string[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const k of keys) {
        const t = k.trim() || "(empty)";
        m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
}

function isoDateOnly(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function isoDate(d: Date): string {
    return d.toISOString();
}

function pickNote(seedKey: string): string {
    return pickPoolMod(NOTES_POOL, hash32(seedKey), "NOTES_POOL");
}

/**
 * Queue preview reads `metadata.next_step` as `_next_step_preview` (not `next_follow_up_at`).
 * @see web/lib/queues/QueueService.ts enrichOpportunityRows
 */
function nextStepForStatus(statusKey: string): string {
    switch (statusKey) {
        case "new_inquiry":
            return "Call family within one business day to confirm interest.";
        case "contact_attempted":
            return "Try a second contact path (email + SMS) and log outcome.";
        case "tour_scheduled":
            return "Send tour confirmation with parking and arrival instructions.";
        case "tour_completed":
            return "Send tuition estimate and enrollment checklist within 24 hours.";
        case "enrolling":
            return "Collect deposit and finalize start date with billing.";
        case "waitlisted":
            return "Offer alternate start window or sibling campus if available.";
        case "enrolled":
            return "Schedule orientation packet pickup and first-day reminders.";
        case "lost":
            return "Archive reason in CRM and close the loop politely.";
        default:
            return "Document the next best action for this family.";
    }
}

/**
 * Deterministic DOB per child member. Sibling index is biased into different enrollment tiers so
 * multi-child households are not all bucketed as the same program (e.g. Toddler 2–3).
 */
function stableChildDob(memberSeedKey: string, idx: number): string {
    const base = hash32(`${memberSeedKey}:child:${idx}`);
    const tier = (idx + modLength(base, 3)) % 3;
    const yearsAgo = tier === 0 ? 0 : tier === 1 ? 3 : 4;
    const monthsAgo = tier === 0 ? 10 + modLength(base, 6) : tier === 1 ? modLength(base >>> 2, 12) : 6 + modLength(base >>> 2, 8);
    const d = new Date();
    d.setFullYear(d.getFullYear() - yearsAgo);
    d.setMonth(Math.max(0, d.getMonth() - monthsAgo));
    d.setDate(1 + modLength(base, 27));
    return isoDateOnly(d);
}

function buildSeedTourTime(h: number): string {
    const hour = 9 + modLength(h, 8);
    const minute = [0, 15, 30, 45][modLength(h >>> 3, 4)];
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function inquiryChildrenRecordsForSeed(p: PlannedFamily): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    for (let c = 0; c < p.childrenCount; c++) {
        const mk = `${p.seedKey}:child:${c}`;
        const dob = stableChildDob(mk, c);
        const months = approximateAgeMonthsFromDobIso(dob) ?? 24;
        const { program_label, age_group } = programLabelAndAgeGroupFromAgeMonths(months);
        out.push({
            display_name: p.children[c]!.display.trim(),
            program_label,
            age_group,
            dob,
        });
    }
    return out;
}

function formatPhone(seedKey: string, offset: number): string {
    const n = 1000 + modLength(hash32(`${seedKey}:ph:${offset}`), 9000);
    const s = String(n).padStart(4, "0");
    return `(503) 555-${s}`;
}

function guardianEmail(seedKey: string, which: 0 | 1, first_name: string, last_name: string): string {
    if (which !== 0 && which !== 1) {
        throw new Error(`guardianEmail: invalid which=${String(which)} (expected 0|1) seedKey=${seedKey}`);
    }
    const fn = String(first_name ?? "").trim();
    const ln = String(last_name ?? "").trim();
    if (!fn || !ln) {
        throw new Error(
            `guardianEmail: missing first_name or last_name after trim — seedKey=${seedKey} which=${which} first_name=${JSON.stringify(first_name)} last_name=${JSON.stringify(last_name)}`
        );
    }
    const h = hash32(`${seedKey}:email:${which}`);
    const domain = pickPoolMod(EMAIL_DOMAINS, h, "EMAIL_DOMAINS");
    const localFirst = fn.toLowerCase().replace(/[^a-z]+/g, "");
    const localLast = ln.toLowerCase().replace(/[^a-z]+/g, "");
    if (!localFirst || !localLast) {
        throw new Error(
            `guardianEmail: name produced empty email local part — seedKey=${seedKey} which=${which} first_name=${JSON.stringify(fn)} last_name=${JSON.stringify(ln)}`
        );
    }
    const addr = `${localFirst}.${localLast}+${modLength(h, 997).toString(36)}@${domain}`;
    if (addr.toLowerCase().includes("demo")) {
        throw new Error(`guardianEmail: generated address must not contain "demo" — seedKey=${seedKey} which=${which} email=${JSON.stringify(addr)}`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
        throw new Error(`guardianEmail: invalid email shape — seedKey=${seedKey} which=${which} email=${JSON.stringify(addr)}`);
    }
    return addr;
}

function visibleTextHasForbiddenSubstring(text: string): string | null {
    const hay = text.toLowerCase();
    for (const sub of FORBIDDEN_VISIBLE_SUBSTRINGS) {
        if (hay.includes(sub.toLowerCase())) return sub;
    }
    return null;
}

type PlannedFamily = {
    index: number;
    seedKey: string;
    siteIdx: number;
    siteKey: string;
    h: number;
    pattern: number;
    childrenCount: 1 | 2 | 3;
    singleParent: boolean;
    withGrandparent: boolean;
    last: string;
    g0First: string;
    g1First: string;
    customerName: string;
    g0Email: string;
    g1Email: string | null;
    grandparent: { first: string; last: string; email: string } | null;
    children: Array<{ first: string; last: string; display: string }>;
    title: string;
    note: string;
    statusKey: string;
    programLabel: string;
    nextStep: string;
};

function plannedFamilyAtIndex(i: number, statusPool: string[], siteLabelAtIdx: (siteIdx: number) => string): PlannedFamily {
    const siteIdx = i % 3;
    const siteKey = SITE_SPECS[siteIdx]!.seedKey;
    const seedKey = `childcare_realistic:${siteKey}:${String(i).padStart(4, "0")}`;
    const h = hash32(seedKey);

    const pattern = modLength(h, 6);
    const childrenCount = (pattern === 0 ? 3 : pattern === 1 ? 2 : 1) as 1 | 2 | 3;
    const singleParent = pattern === 2 || pattern === 5;
    const withGrandparent = pattern === 4;

    const last = pickPoolMod(LAST_NAMES, h, "LAST_NAMES");
    const g0First = pickPoolMod(FIRST_NAMES_F, h >>> 2, "FIRST_NAMES_F");
    const g1First = pickPoolMod(FIRST_NAMES_M, h >>> 4, "FIRST_NAMES_M");
    const customerName = `${last} household`;

    const g0Email = guardianEmail(seedKey, 0, g0First, last);
    const g1Email = singleParent ? null : guardianEmail(seedKey, 1, g1First, last);

    let grandparent: PlannedFamily["grandparent"] = null;
    if (withGrandparent) {
        const gf = pickPoolMod(FIRST_NAMES_F, h >>> 6, "FIRST_NAMES_F");
        const gl = "Walsh";
        grandparent = {
            first: gf,
            last: gl,
            email: guardianEmail(`${seedKey}:gp`, 0, gf, gl),
        };
    }

    const children: PlannedFamily["children"] = [];
    for (let c = 0; c < childrenCount; c++) {
        const cf = pickPoolMod(CHILD_FIRST, h + c * 13, "CHILD_FIRST");
        const cl = last;
        children.push({ first: cf, last: cl, display: `${cf} ${cl}`.trim() });
    }

    const statusKey = statusPool[i]!;
    const siteLabel = siteLabelAtIdx(siteIdx);
    const title = `Family inquiry — ${last} / ${siteLabel}`;
    const note = pickNote(seedKey);
    const firstChildDob = stableChildDob(`${seedKey}:child:0`, 0);
    const firstChildMonths = approximateAgeMonthsFromDobIso(firstChildDob) ?? 24;
    const { program_label: programLabel } = programLabelAndAgeGroupFromAgeMonths(firstChildMonths);
    const nextStep = nextStepForStatus(statusKey);

    return {
        index: i,
        seedKey,
        siteIdx,
        siteKey,
        h,
        pattern,
        childrenCount,
        singleParent,
        withGrandparent,
        last,
        g0First,
        g1First,
        customerName,
        g0Email,
        g1Email,
        grandparent,
        children,
        title,
        note,
        statusKey,
        programLabel,
        nextStep,
    };
}

function runSeedPreflight(totalOpps: number, statusPool: string[]): void {
    if (statusPool.length !== totalOpps) {
        throw new Error(`Preflight: statusPool length ${statusPool.length} !== totalOpps ${totalOpps}`);
    }
    const siteLabelAtIdx = (siteIdx: number) => SITE_SPECS[siteIdx]!.label;
    const errors: string[] = [];
    for (let i = 0; i < totalOpps; i++) {
        const p = plannedFamilyAtIndex(i, statusPool, siteLabelAtIdx);
        const checkVisible = (field: string, value: string) => {
            const hit = visibleTextHasForbiddenSubstring(value);
            if (hit) errors.push(`record i=${i} seedKey=${p.seedKey}: ${field} contains forbidden "${hit}": ${JSON.stringify(value)}`);
        };

        if (!p.g0First.trim() || !p.last.trim()) {
            errors.push(`record i=${i} seedKey=${p.seedKey}: guardian0 missing first/last (g0First=${JSON.stringify(p.g0First)} last=${JSON.stringify(p.last)})`);
        }
        if (!p.singleParent && (!p.g1First.trim() || !p.last.trim())) {
            errors.push(`record i=${i} seedKey=${p.seedKey}: guardian1 missing first/last (g1First=${JSON.stringify(p.g1First)} last=${JSON.stringify(p.last)})`);
        }

        checkVisible("customerName", p.customerName);
        checkVisible("title", p.title);
        checkVisible("note", p.note);
        checkVisible("g0First", p.g0First);
        checkVisible("g0 last", p.last);
        checkVisible("g1First", p.g1First);
        checkVisible("programLabel", p.programLabel);
        checkVisible("nextStep", p.nextStep);

        for (const ch of p.children) {
            if (!ch.first.trim() || !ch.last.trim()) {
                errors.push(`record i=${i} seedKey=${p.seedKey}: child missing first/last ${JSON.stringify(ch)}`);
            }
            checkVisible("child.display", ch.display);
            checkVisible("child.first", ch.first);
            checkVisible("child.last", ch.last);
        }

        if (p.grandparent) {
            if (!p.grandparent.first.trim() || !p.grandparent.last.trim()) {
                errors.push(
                    `record i=${i} seedKey=${p.seedKey}: grandparent missing first/last ${JSON.stringify(p.grandparent)}`
                );
            }
            checkVisible("gp.first", p.grandparent.first);
            checkVisible("gp.last", p.grandparent.last);
        }

        if (p.childrenCount >= 2) {
            const progLabels: string[] = [];
            for (let c = 0; c < p.childrenCount; c++) {
                const mk = `${p.seedKey}:child:${c}`;
                const dob = stableChildDob(mk, c);
                const months = approximateAgeMonthsFromDobIso(dob) ?? 24;
                progLabels.push(programLabelAndAgeGroupFromAgeMonths(months).program_label);
            }
            const uniq = new Set(progLabels);
            if (uniq.size < p.childrenCount) {
                errors.push(
                    `record i=${i} seedKey=${p.seedKey}: expected distinct program tiers per sibling, got [${progLabels.join(", ")}]`
                );
            }
        }

        const emails = [p.g0Email, p.g1Email, p.grandparent?.email].filter(Boolean) as string[];
        for (const em of emails) {
            if (em.toLowerCase().includes("demo")) {
                errors.push(`record i=${i} seedKey=${p.seedKey}: email contains "demo": ${JSON.stringify(em)}`);
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
                errors.push(`record i=${i} seedKey=${p.seedKey}: invalid email ${JSON.stringify(em)}`);
            }
        }
    }
    if (errors.length) {
        throw new Error(`Seed preflight failed (${errors.length} issue(s)):\n${errors.slice(0, 40).join("\n")}${errors.length > 40 ? `\n… and ${errors.length - 40} more` : ""}`);
    }
}

async function getChildcareVerticalId(supabase: SupabaseAdmin): Promise<string> {
    const { data, error } = await supabase.from("verticals").select("id").eq("slug", "childcare").eq("is_active", true).maybeSingle();
    if (error || !data) throw new Error("Missing active verticals row for slug 'childcare'.");
    return (data as { id: string }).id;
}

async function ensureDepartment(
    supabase: SupabaseAdmin,
    orgId: string,
    key: string,
    name: string,
    description: string | null,
    sortOrder: number
): Promise<string> {
    const { data: existing } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("org_id", orgId)
        .eq("key", key)
        .maybeSingle();
    const seedKey = `dept_seed:${key}`;
    const meta = demoSeedMetadata(seedKey);
    if ((existing as { id?: string } | null)?.id) {
        const row = existing as { id: string; metadata?: unknown };
        const id = row.id;

        // Demo tooling INITIALIZES; it never replaces an established department.
        //
        // This previously wrote `metadata: meta` — a small marker object — over the whole column,
        // destroying `lifecycle_builder_v1` and every process, stage and work view inside it. Same
        // class of defect as the one fixed in applyVerticalBootstrap. Demo tooling must never be
        // able to overwrite publication-owned configuration; existing keys win over seed markers.
        const existingMeta =
            row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        const mergedMeta = { ...meta, ...existingMeta };

        const { error: upErr } = await supabase
            .from("departments")
            .update({
                name,
                description,
                sort_order: sortOrder,
                is_active: true,
                metadata: mergedMeta,
            })
            .eq("id", id);
        if (upErr) throw new Error(`departments update ${key}: ${upErr.message}`);
        return id;
    }
    const { data: created, error } = await supabase
        .from("departments")
        .insert({
            org_id: orgId,
            key,
            name,
            description,
            sort_order: sortOrder,
            is_active: true,
            metadata: meta,
        })
        .select("id")
        .single();
    if (error) throw new Error(`departments insert ${key}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureSite(supabase: SupabaseAdmin, orgId: string, seedKey: string, label: string): Promise<string> {
    const { data: existing } = await supabase.from("locations").select("id").eq("org_id", orgId).eq("metadata->>seed_key", seedKey).maybeSingle();
    const meta = demoSeedMetadata(seedKey);
    if ((existing as { id?: string } | null)?.id) {
        const id = (existing as { id: string }).id;
        const { error: upErr } = await supabase
            .from("locations")
            .update({
                label,
                location_type: "site",
                is_active: true,
                metadata: meta,
            })
            .eq("id", id);
        if (upErr) throw new Error(`locations site update ${seedKey}: ${upErr.message}`);
        return id;
    }

    const { data: created, error } = await supabase
        .from("locations")
        .insert({
            org_id: orgId,
            label,
            location_type: "site",
            is_active: true,
            metadata: meta,
        })
        .select("id")
        .single();
    if (error) throw new Error(`locations site ${seedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureRoom(supabase: SupabaseAdmin, orgId: string, siteId: string, siteSeed: string, roomName: string, roomIdx: number): Promise<string> {
    const seedKey = `${siteSeed}:room:${roomIdx}:${roomName.toLowerCase().replace(/\s+/g, "_")}`;
    const { data: existing } = await supabase.from("locations").select("id").eq("org_id", orgId).eq("metadata->>seed_key", seedKey).maybeSingle();
    const roomMeta = {
        ...demoSeedMetadata(seedKey),
        semantic_kind: "classroom",
        campus_room: true,
    };
    if ((existing as { id?: string } | null)?.id) {
        const id = (existing as { id: string }).id;
        const { error: upErr } = await supabase
            .from("locations")
            .update({
                label: `${roomName}`,
                location_type: "unit",
                parent_location_id: siteId,
                is_active: true,
                metadata: roomMeta,
            })
            .eq("id", id);
        if (upErr) throw new Error(`locations room update ${seedKey}: ${upErr.message}`);
        return id;
    }

    const { data: created, error } = await supabase
        .from("locations")
        .insert({
            org_id: orgId,
            label: `${roomName}`,
            /** DB check `locations_location_type_check` allows only address | site | unit (see remote_schema). */
            location_type: "unit",
            parent_location_id: siteId,
            is_active: true,
            metadata: roomMeta,
        })
        .select("id")
        .single();
    if (error) throw new Error(`locations room ${seedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

async function resolveEnrollmentWorkUnitId(supabase: SupabaseAdmin, orgId: string): Promise<string> {
    const { data: dept } = await supabase.from("departments").select("id").eq("org_id", orgId).eq("key", "enrollment").maybeSingle();
    const deptId = (dept as { id?: string } | null)?.id;
    if (!deptId) throw new Error('Missing department key "enrollment" for this org.');

    const { data: wu } = await supabase
        .from("work_units")
        .select("id")
        .eq("org_id", orgId)
        .eq("department_id", deptId)
        .eq("key", "enrollment_pipeline")
        .maybeSingle();
    const wuId = (wu as { id?: string } | null)?.id;
    if (!wuId) throw new Error('Missing work unit enrollment/enrollment_pipeline for this org.');
    return wuId;
}

async function ensureCustomer(supabase: SupabaseAdmin, orgId: string, seedKey: string, displayName: string): Promise<string> {
    const { data: existing } = await supabase.from("customers").select("id").eq("org_id", orgId).eq("metadata->>seed_key", seedKey).maybeSingle();
    const verticalId = await getChildcareVerticalId(supabase);
    const meta = demoSeedMetadata(seedKey);
    if ((existing as { id?: string } | null)?.id) {
        const id = (existing as { id: string }).id;
        const { error: upErr } = await supabase
            .from("customers")
            .update({
                name: displayName,
                vertical_id: verticalId,
                metadata: meta,
            })
            .eq("id", id);
        if (upErr) throw new Error(`customers update ${seedKey}: ${upErr.message}`);
        return id;
    }

    const { data: created, error } = await supabase
        .from("customers")
        .insert({
            org_id: orgId,
            name: displayName,
            vertical_id: verticalId,
            metadata: meta,
        })
        .select("id")
        .single();
    if (error) throw new Error(`customers ${seedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensurePerson(
    supabase: SupabaseAdmin,
    orgId: string,
    personSeedKey: string,
    first: string,
    last: string,
    opts: { email: string | null; phone: string | null; dob?: string | null }
): Promise<string> {
    const { data: existing } = await supabase.from("persons").select("id").eq("org_id", orgId).eq("metadata->>seed_key", personSeedKey).maybeSingle();
    const meta = demoSeedMetadata(personSeedKey);
    const row = {
        first_name: first,
        last_name: last,
        email: opts.email,
        phone: opts.phone,
        ...(opts.dob ? { date_of_birth: opts.dob } : {}),
        metadata: meta,
    };
    if ((existing as { id?: string } | null)?.id) {
        const id = (existing as { id: string }).id;
        const { error: upErr } = await supabase.from("persons").update(row).eq("id", id);
        if (upErr) throw new Error(`persons update ${personSeedKey}: ${upErr.message}`);
        return id;
    }

    const { data: created, error } = await supabase
        .from("persons")
        .insert({
            org_id: orgId,
            ...row,
        })
        .select("id")
        .single();
    if (error) throw new Error(`persons ${personSeedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureCustomerPerson(
    supabase: SupabaseAdmin,
    orgId: string,
    customerId: string,
    personId: string,
    roleType: string,
    isPrimary: boolean,
    linkSeedKey: string
): Promise<void> {
    const meta = demoSeedMetadata(linkSeedKey);
    const { data: existing } = await supabase
        .from("customer_persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("person_id", personId)
        .eq("role_type", roleType)
        .maybeSingle();
    if ((existing as { id?: string } | null)?.id) {
        const { error: upErr } = await supabase
            .from("customer_persons")
            .update({ metadata: meta })
            .eq("id", (existing as { id: string }).id);
        if (upErr) throw new Error(`customer_persons update: ${upErr.message}`);
        return;
    }
    const { error } = await supabase.from("customer_persons").insert({
        org_id: orgId,
        customer_id: customerId,
        person_id: personId,
        role_type: roleType,
        is_primary: isPrimary,
        metadata: meta,
    } as never);
    if (error) throw new Error(`customer_persons: ${error.message}`);
}

async function ensureCustomerMemberChild(
    supabase: SupabaseAdmin,
    orgId: string,
    customerId: string,
    memberSeedKey: string,
    childFirst: string,
    childLast: string,
    idx: number
): Promise<string> {
    const { data: existing } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("metadata->>seed_key", memberSeedKey)
        .maybeSingle();
    const childPersonId = await ensurePerson(supabase, orgId, `${memberSeedKey}:person`, childFirst, childLast, {
        email: null,
        phone: null,
        dob: stableChildDob(memberSeedKey, idx),
    });
    const display = `${childFirst} ${childLast}`.trim();
    const dob = stableChildDob(memberSeedKey, idx);
    const months = approximateAgeMonthsFromDobIso(dob) ?? 24;
    const { program_label: childProgramLabel, age_group: childAgeGroup } = programLabelAndAgeGroupFromAgeMonths(months);
    const memMeta = { ...demoSeedMetadata(memberSeedKey), program_label: childProgramLabel, age_group: childAgeGroup };
    const memberRow = {
        display_name: display,
        relationship: "child",
        first_name: childFirst,
        last_name: childLast,
        dob,
        person_id: childPersonId,
        is_active: true,
        metadata: memMeta,
    };
    if ((existing as { id?: string } | null)?.id) {
        const id = (existing as { id: string }).id;
        const { error: upErr } = await supabase.from("customer_members").update(memberRow as never).eq("id", id);
        if (upErr) throw new Error(`customer_members update ${memberSeedKey}: ${upErr.message}`);
        return id;
    }

    const { data: created, error } = await supabase
        .from("customer_members")
        .insert({
            org_id: orgId,
            customer_id: customerId,
            ...memberRow,
        } as never)
        .select("id")
        .single();
    if (error) throw new Error(`customer_members ${memberSeedKey}: ${error.message}`);
    return (created as { id: string }).id;
}

async function ensureOppChildJoin(
    supabase: SupabaseAdmin,
    orgId: string,
    opportunityId: string,
    customerMemberId: string,
    joinSeedKey: string
): Promise<void> {
    const meta = demoSeedMetadata(joinSeedKey);
    const { data: existing } = await supabase
        .from("opportunity_customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId)
        .eq("customer_member_id", customerMemberId)
        .maybeSingle();
    if ((existing as { id?: string } | null)?.id) {
        const { error: upErr } = await supabase
            .from("opportunity_customer_members")
            .update({ metadata: meta })
            .eq("id", (existing as { id: string }).id);
        if (upErr) throw new Error(`opportunity_customer_members update: ${upErr.message}`);
        return;
    }
    const { error } = await supabase.from("opportunity_customer_members").insert({
        org_id: orgId,
        opportunity_id: opportunityId,
        customer_member_id: customerMemberId,
        metadata: meta,
    } as never);
    if (error) throw new Error(`opportunity_customer_members: ${error.message}`);
}

type SeedOpportunityExtras = {
    inquiry_children: Record<string, unknown>[];
    notes_at: string;
    tour_time: string | null;
    /** When true, insert uses an intentionally stale `updated_at` so ~20% of rows surface in needs_attention. */
    force_stale_updated_at: boolean;
};

async function ensureOpportunity(
    supabase: SupabaseAdmin,
    orgId: string,
    verticalId: string,
    workUnitId: string,
    seedKey: string,
    title: string,
    statusKey: string,
    guardianPersonId: string,
    customerId: string,
    siteLocationId: string,
    createdAt: Date,
    note: string,
    extras?: SeedOpportunityExtras
): Promise<{ id: string; tuitionCents: number | null }> {
    const h = hash32(seedKey);
    const desired = new Date(createdAt.getTime() + (modLength(h, 90) - 30) * 86400000);
    const tourEligible = ["tour_scheduled", "tour_completed", "enrolling", "waitlisted", "enrolled"].includes(statusKey);
    const tourDate = tourEligible ? new Date(createdAt.getTime() + (modLength(h, 40) - 10) * 86400000) : null;
    const follow = new Date(createdAt.getTime() + (modLength(h, 50) - 25) * 86400000);

    const inquiryList = extras?.inquiry_children ?? [];
    const firstChild = inquiryList[0] as Record<string, unknown> | undefined;
    const programLabelsFromInquiry = inquiryList
        .map((ic) => {
            const pl = (ic as Record<string, unknown>).program_label;
            return typeof pl === "string" ? pl.trim() : "";
        })
        .filter(Boolean);
    const uniqPrograms = [...new Set(programLabelsFromInquiry)];
    const program_label =
        uniqPrograms.length > 1
            ? uniqPrograms.join(" · ")
            : uniqPrograms.length === 1
              ? uniqPrograms[0]!
              : typeof firstChild?.program_label === "string" && String(firstChild.program_label).trim()
                ? String(firstChild.program_label).trim()
                : pickPoolMod(PROG_LABELS, h, "PROG_LABELS");
    const age_group =
        uniqPrograms.length > 1
            ? ""
            : typeof firstChild?.age_group === "string" && String(firstChild.age_group).trim()
              ? String(firstChild.age_group).trim()
              : ageGroupForProgramLabel(program_label);

    const tuitionCents =
        statusKey === "enrolled" || statusKey === "enrolling" ? 120_000 + modLength(h, 8) * 2_500 : null;

    const tourTimeValue = tourEligible ? (extras?.tour_time ?? buildSeedTourTime(h)) : null;
    const notesAtIso = extras?.notes_at ?? isoDate(createdAt);

    const sharedPayload: Record<string, unknown> = {
        org_id: orgId,
        vertical_id: verticalId,
        name: title,
        status_key: statusKey,
        work_unit_id: workUnitId,
        customer_id: customerId,
        primary_person_id: guardianPersonId,
        primary_contact_id: null,
        location_id: siteLocationId,
        ...(tuitionCents != null ? { quote_total: tuitionCents / 100 } : {}),
        metadata: {
            ...demoSeedMetadata(seedKey),
            program_label,
            age_group,
            ...(inquiryList.length ? { inquiry_children: inquiryList } : {}),
            // opportunity-level legacy metadata key — not the OCM column
            desired_start_date: isoDateOnly(desired),
            tour_date: tourDate ? isoDateOnly(tourDate) : null,
            ...(tourTimeValue ? { tour_time: tourTimeValue } : {}),
            notes: note,
            notes_at: notesAtIso,
            next_follow_up_at: isoDate(follow),
            next_step: nextStepForStatus(statusKey),
        },
    };

    const { data: existing } = await supabase.from("opportunities").select("id").eq("org_id", orgId).eq("metadata->>seed_key", seedKey).maybeSingle();
    const existingId = (existing as { id?: string } | null)?.id;

    if (existingId) {
        const updateRow: Record<string, unknown> = {
            ...sharedPayload,
            updated_at: isoDate(new Date()),
        };
        await normalizeOpportunityWritePayload(supabase, updateRow, "seedRealisticChildcareDemoData:ensureOpportunity:update");
        const { error: upErr } = await supabase.from("opportunities").update(updateRow as never).eq("id", existingId);
        if (upErr) throw new Error(`opportunities update ${seedKey}: ${upErr.message}`);
        return { id: existingId, tuitionCents };
    }

    const nowWall = new Date();
    const staleWall = new Date(nowWall.getTime() - (5 + modLength(h, 20)) * 86400000);
    const insertUpdatedAt = extras?.force_stale_updated_at ? isoDate(staleWall) : isoDate(nowWall);

    const insertRow: Record<string, unknown> = {
        ...sharedPayload,
        created_at: isoDate(createdAt),
        updated_at: insertUpdatedAt,
    };
    await normalizeOpportunityWritePayload(supabase, insertRow, "seedRealisticChildcareDemoData:ensureOpportunity:insert");
    const { data: created, error } = await supabase.from("opportunities").insert(insertRow as never).select("id").single();
    if (error) throw new Error(`opportunities ${seedKey}: ${error.message}`);
    return { id: (created as { id: string }).id, tuitionCents };
}

async function ensureQuoteForOpportunity(
    supabase: SupabaseAdmin,
    orgId: string,
    opportunityId: string,
    seedKey: string,
    totalCents: number
): Promise<void> {
    const qk = `${seedKey}:quote`;
    const { data: existing } = await supabase.from("quotes").select("id").eq("org_id", orgId).eq("metadata->>seed_key", qk).maybeSingle();
    if ((existing as { id?: string } | null)?.id) {
        const { error: upErr } = await supabase
            .from("quotes")
            .update({
                subtotal_cents: totalCents,
                total_cents: totalCents,
                currency: "USD",
                status: "sent",
                metadata: demoSeedMetadata(qk),
            })
            .eq("id", (existing as { id: string }).id);
        if (upErr) {
            console.warn(`quotes update ${qk}: ${upErr.message}`);
        }
        return;
    }

    const { error } = await supabase.from("quotes").insert({
        org_id: orgId,
        opportunity_id: opportunityId,
        subtotal_cents: totalCents,
        total_cents: totalCents,
        currency: "USD",
        status: "sent",
        metadata: demoSeedMetadata(qk),
    } as never);
    if (error && !String(error.message).toLowerCase().includes("duplicate")) {
        console.warn(`quotes ${qk}: ${error.message}`);
    }
}

function assertDemoVisibleText(label: string, text: string): void {
    const bad = visibleTextHasForbiddenSubstring(text);
    if (bad) {
        throw new Error(`Demo communications copy hit forbidden substring "${bad}" (${label})`);
    }
}

type DemoCommChannel = "email" | "sms";

function demoCommRecipientKey(channel: DemoCommChannel, emailRaw: string, phoneRaw: string): string {
    if (channel === "email") return normalizeRecipientKeyEmail(emailRaw);
    return normalizeRecipientKeySms(phoneRaw);
}

function demoCommMessagePlan(count: number, h: number): Array<"inbound" | "outbound"> {
    if (count <= 0) return [];
    if (count === 1) return [modLength(h >>> 19, 2) === 0 ? "outbound" : "inbound"];
    if (count === 2) {
        const flip = modLength(h >>> 21, 2) === 0;
        return flip ? ["outbound", "inbound"] : ["inbound", "outbound"];
    }
    return ["outbound", "inbound", "outbound"];
}

function demoCommBody(
    channel: DemoCommChannel,
    direction: "inbound" | "outbound",
    idx: number,
    ctx: { g0First: string; siteLabel: string; title: string },
    h: number
): { body: string; subject: string | null } {
    const { g0First, siteLabel, title } = ctx;
    const site = siteLabel.trim() || "our campus";
    const pick = (pool: readonly string[], salt: number) => pickPoolMod(pool, h ^ salt, "demo_comm");

    if (channel === "sms") {
        if (direction === "outbound") {
            const line =
                idx === 0
                    ? `Hi ${g0First}, confirming we received your inquiry for ${site}. Reply YES if you would like a tour link.`
                    : `Reminder: we saved a spot on the tour waitlist for ${site}. Text back if you need a different time.`;
            return { body: pick([line, `${line} Thanks!`], 3), subject: null };
        }
        const line =
            idx === 0
                ? `Yes, ${g0First} here — can we visit ${site} this week?`
                : `Running 5 min late for pickup, still on the way.`;
        return { body: pick([line, `${line} Appreciate it.`], 5), subject: null };
    }

    if (direction === "outbound") {
        if (idx === 0) {
            const body = pick(
                [
                    `Thanks for contacting ${site} about enrollment. I would love to help with schedules, tuition, or a tour.`,
                    `Hello ${g0First},\n\nThank you for your interest in ${site}. I attached a quick overview of classrooms and ratios. Let me know what questions you have.`,
                ],
                7
            );
            const subject = pick(
                [`Welcome — next steps for ${site}`, `Your inquiry at ${site}`, `Following up: ${title.slice(0, 60)}`],
                9
            );
            return { body, subject };
        }
        const body = pick(
            [
                `Hi ${g0First},\n\nAbsolutely — I blocked a time that should work. If you prefer a virtual walkthrough instead, say the word and I will send a link.`,
                `${g0First},\n\nGreat question on start dates. We usually have rolling openings in that classroom; I will confirm with the director and circle back today.`,
            ],
            11
        );
        const subject = pick([`Re: enrollment at ${site}`, `Update from ${site}`], 13);
        return { body, subject };
    }

    const body = pick(
        [
            `${g0First} here — quick question on the tour: is parking easiest in the front lot or around the side?`,
            `Hi,\n\nCould you send the tuition sheet for two days per week? Also wondering if lunch is included for preschool.\n\nThanks,\n${g0First}`,
            `We are comparing a few centers. What is your typical wait time for the toddler room at ${site}?`,
        ],
        15
    );
    const subject = pick([`Question about ${site}`, `Re: ${title.slice(0, 50)}`, `Tour / enrollment question`], 17);
    return { body, subject };
}

function demoCommTimestamps(createdAt: Date, count: number, h: number): string[] {
    const base = createdAt.getTime();
    const offsetsHours = [
        6 + modLength(h, 18),
        36 + modLength(h >>> 3, 60),
        96 + modLength(h >>> 5, 72),
    ];
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
        const ms = base + offsetsHours[i]! * 3600_000 + modLength(h >>> (7 + i), 45) * 60_000;
        out.push(new Date(ms).toISOString());
    }
    return out;
}

/**
 * Idempotent demo rows: removes prior demo-tagged threads for this opportunity, then inserts 1–3 messages (~37% of opps).
 */
async function ensureDemoOpportunityCommunications(
    supabase: SupabaseAdmin,
    orgId: string,
    opportunityId: string,
    customerId: string,
    seedKey: string,
    h: number,
    createdAt: Date,
    channel: DemoCommChannel,
    emailRaw: string,
    phoneRaw: string,
    siteLabel: string,
    g0First: string,
    title: string
): Promise<void> {
    if (modLength(h, 100) >= DEMO_COMM_SEED_PERCENT) return;

    const recipientKey = demoCommRecipientKey(channel, emailRaw, phoneRaw);
    if (channel === "email" && !recipientKey) return;
    if (channel === "sms" && !recipientKey) return;

    const { data: staleThreads, error: delSelErr } = await supabase
        .from("communication_threads")
        .select("id")
        .eq("org_id", orgId)
        .eq("primary_entity_type", "opportunities")
        .eq("primary_entity_id", opportunityId)
        .eq("metadata->>demo_realistic_comm", "1");
    if (delSelErr) throw new Error(`communication_threads (pre-clean select): ${delSelErr.message}`);
    const staleIds = (staleThreads ?? []).map((r) => (r as { id: string }).id).filter(Boolean);
    if (staleIds.length) {
        const { error: delErr } = await supabase.from("communication_threads").delete().in("id", staleIds);
        if (delErr) throw new Error(`communication_threads (pre-clean delete): ${delErr.message}`);
    }

    const msgCount = 1 + modLength(h >>> 11, 3);
    const plan = demoCommMessagePlan(msgCount, h);
    const stamps = demoCommTimestamps(createdAt, msgCount, h);
    const ctx = { g0First, siteLabel, title };

    const threadMeta: Record<string, unknown> = {
        demo_realistic_comm: "1",
        demo_seed_package: STAGING_REALISTIC_CHILDCARE_SEED_PACKAGE,
        seed_key: seedKey,
    };

    const { data: insThread, error: tErr } = await supabase
        .from("communication_threads")
        .insert({
            org_id: orgId,
            primary_entity_type: "opportunities",
            primary_entity_id: opportunityId,
            channel,
            recipient_key: recipientKey,
            metadata: threadMeta,
            created_at: stamps[0]!,
            updated_at: stamps[stamps.length - 1]!,
        } as never)
        .select("id")
        .single();
    if (tErr) throw new Error(`communication_threads insert ${seedKey}: ${tErr.message}`);
    const threadId = (insThread as { id: string }).id;

    const slug = String(seedKey).replace(/[^a-z0-9]+/gi, "").slice(0, 24) || "campus";
    const centerEmail = `enrollment.messages@${slug}.example.org`.toLowerCase();
    const centerSmsE164 = `+1555000${String(1000 + modLength(h >>> 23, 8999)).slice(-4)}`;

    for (let i = 0; i < msgCount; i++) {
        const direction = plan[i]!;
        const { body, subject } = demoCommBody(channel, direction, i, ctx, h ^ (i * 997));
        assertDemoVisibleText(`comm body ${seedKey}:${i}`, body);
        if (subject) assertDemoVisibleText(`comm subject ${seedKey}:${i}`, subject);

        const created_at = stamps[i]!;
        const meta = { ...DEMO_COMM_MSG_META, customer_id: customerId, opportunity_id: opportunityId, seq: i };

        let from_address: string | null = null;
        let to_address: string | null = null;
        if (channel === "email") {
            if (direction === "outbound") {
                from_address = centerEmail;
                to_address = recipientKey;
            } else {
                from_address = recipientKey;
                to_address = centerEmail;
            }
        } else if (direction === "outbound") {
            from_address = centerSmsE164;
            to_address = recipientKey;
        } else {
            from_address = recipientKey;
            to_address = centerSmsE164;
        }

        const status = direction === "inbound" ? "delivered" : "sent";
        const sent_at = direction === "outbound" ? created_at : null;

        const row: Record<string, unknown> = {
            org_id: orgId,
            thread_id: threadId,
            channel,
            direction,
            status,
            body,
            body_format: "plain",
            from_address,
            to_address,
            metadata: meta,
            workflow_run_id: null,
            communication_provider_binding_id: null,
            created_at,
            sent_at,
        };
        if (channel === "email") {
            row.subject = subject;
        }

        const { error: mErr } = await supabase.from("communication_messages").insert(row as never);
        if (mErr) throw new Error(`communication_messages insert ${seedKey}:${i}: ${mErr.message}`);
    }
}

async function ensureUserRoleIfAbsent(supabase: SupabaseAdmin, orgId: string, userId: string, role: string): Promise<void> {
    const { data: row } = await supabase.from("user_roles").select("user_id").eq("org_id", orgId).eq("user_id", userId).eq("role", role).maybeSingle();
    if (row) return;
    const { data: def } = await supabase.from("role_definitions").select("role_key").eq("org_id", orgId).eq("role_key", role).eq("is_active", true).maybeSingle();
    if (!def) {
        console.warn(`Skipping role "${role}" — not defined for org.`);
        return;
    }
    const { error } = await supabase.from("user_roles").insert({ org_id: orgId, user_id: userId, role } as never);
    if (error) throw new Error(`user_roles ${userId} ${role}: ${error.message}`);
}

function asMetaRecord(v: unknown): Record<string, unknown> | null {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
}

function mdString(md: Record<string, unknown> | null, key: string): string | null {
    if (!md) return null;
    const v = md[key];
    return typeof v === "string" ? v : null;
}

function stripLeadingNoteTimestampLike(raw: string): string {
    let s = raw.trim();
    if (!s) return s;
    s = s.replace(
        /^(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+(?:AM|PM))\s+·\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+—\s+/i,
        "$1 — "
    );
    s = s.replace(/^\d{1,2}:\d{2}\s*(?:AM|PM)\s+—\s+/i, "");
    s = s.replace(/^\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+—\s+/i, "");
    s = s.replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s+—\s+/i, "");
    return s.trim();
}

function looksLikeLeadingNoteTimestamp(raw: string): boolean {
    const s = raw.trim();
    if (!s) return false;
    return (
        /^\d{1,2}:\d{2}\s*(?:AM|PM)\s+—\s+/i.test(s) ||
        /^\d{1,2}\/\d{1,2}\/\d{4}/.test(s) ||
        /^\[[^\]]+\]/.test(s)
    );
}

function zonedWallToUtcIso(params: {
    ymd: string;
    hour12: number;
    minute: number;
    ampm: "AM" | "PM";
    timeZoneIana: string;
}): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.ymd.trim());
    if (!m) return null;
    let h = params.hour12 % 12;
    if (params.ampm === "PM") h += 12;
    const wallUtc = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, params.minute, 0, 0));
    try {
        const d = fromZonedTime(wallUtc, params.timeZoneIana);
        return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    } catch {
        return null;
    }
}

function extractBestNoteTimestampAndBody(params: {
    raw: string;
    fallbackYmd: string | null;
    timeZoneIana: string;
}): { notesAtIso: string | null; body: string } {
    const s0 = params.raw.trim();
    if (!s0) return { notesAtIso: null, body: "" };

    // Case 1: already-enriched "MM/DD/YYYY h:mm AM/PM · h:mm AM/PM — Body" (choose embedded time).
    const dot = s0.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+\d{1,2}:\d{2}\s+(AM|PM)\s+·\s+(\d{1,2}):(\d{2})\s+(AM|PM)\s+—\s+([\s\S]+)$/i
    );
    if (dot) {
        const ymd = `${dot[3]}-${String(dot[1]).padStart(2, "0")}-${String(dot[2]).padStart(2, "0")}`;
        const iso = zonedWallToUtcIso({
            ymd,
            hour12: Number(dot[5]),
            minute: Number(dot[6]),
            ampm: String(dot[7]).toUpperCase() === "PM" ? "PM" : "AM",
            timeZoneIana: params.timeZoneIana,
        });
        return { notesAtIso: iso, body: stripLeadingNoteTimestampLike(dot[8] ?? "") };
    }

    // Case 2: full US datetime prefix.
    const full = s0.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})\s+(AM|PM)\s+—\s+([\s\S]+)$/i
    );
    if (full) {
        const ymd = `${full[3]}-${String(full[1]).padStart(2, "0")}-${String(full[2]).padStart(2, "0")}`;
        const iso = zonedWallToUtcIso({
            ymd,
            hour12: Number(full[4]),
            minute: Number(full[5]),
            ampm: String(full[6]).toUpperCase() === "PM" ? "PM" : "AM",
            timeZoneIana: params.timeZoneIana,
        });
        return { notesAtIso: iso, body: stripLeadingNoteTimestampLike(full[7] ?? "") };
    }

    // Case 3: time-only prefix — keep date from notes_at/created_at fallback.
    const timeOnly = s0.match(/^(\d{1,2}):(\d{2})\s+(AM|PM)\s+—\s+([\s\S]+)$/i);
    if (timeOnly && params.fallbackYmd) {
        const iso = zonedWallToUtcIso({
            ymd: params.fallbackYmd,
            hour12: Number(timeOnly[1]),
            minute: Number(timeOnly[2]),
            ampm: String(timeOnly[3]).toUpperCase() === "PM" ? "PM" : "AM",
            timeZoneIana: params.timeZoneIana,
        });
        return { notesAtIso: iso, body: stripLeadingNoteTimestampLike(timeOnly[4] ?? "") };
    }

    // Case 4: bracketed ISO timestamp.
    const bracket = s0.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    if (bracket) {
        const ms = Date.parse(bracket[1]!.trim());
        return {
            notesAtIso: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
            body: stripLeadingNoteTimestampLike(bracket[2] ?? ""),
        };
    }

    return { notesAtIso: null, body: stripLeadingNoteTimestampLike(s0) };
}

function effectiveQuotePresent(o: {
    quote_total: number | null;
    estimated_price_cents: number | null;
    monetary_value_cents: number | null;
}, quoteCentsFromTable: number): boolean {
    if (o.quote_total != null && Number(o.quote_total) > 0) return true;
    if ((o.estimated_price_cents ?? 0) > 0 || (o.monetary_value_cents ?? 0) > 0) return true;
    return quoteCentsFromTable > 0;
}

async function printSeedValidationSummary(supabase: SupabaseAdmin, orgId: string): Promise<void> {
    const pkg = STAGING_REALISTIC_CHILDCARE_SEED_PACKAGE;

    const { data: oppsRaw, error: oppErr } = await supabase
        .from("opportunities")
        .select(
            "id,name,status_key,customer_id,primary_person_id,primary_contact_id,location_id,work_unit_id,metadata,quote_total,monetary_value_cents,estimated_price_cents,created_at,updated_at"
        )
        .eq("org_id", orgId)
        .eq("metadata->>demo_seed_package", pkg)
        .order("created_at", { ascending: true });
    if (oppErr) throw new Error(`validation opportunities: ${oppErr.message}`);
    const opps = (oppsRaw ?? []) as Array<{
        id: string;
        name: string | null;
        status_key: string | null;
        customer_id: string | null;
        primary_person_id: string | null;
        primary_contact_id: string | null;
        location_id: string | null;
        work_unit_id: string | null;
        metadata: unknown;
        quote_total: number | null;
        monetary_value_cents: number | null;
        estimated_price_cents: number | null;
        created_at: string | null;
        updated_at: string | null;
    }>;

    const { count: custCount, error: custCountErr } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("metadata->>demo_seed_package", pkg);
    if (custCountErr) throw new Error(`validation customers count: ${custCountErr.message}`);

    const { count: personCount, error: personCountErr } = await supabase
        .from("persons")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("metadata->>demo_seed_package", pkg);
    if (personCountErr) throw new Error(`validation persons count: ${personCountErr.message}`);

    const { data: demoSites, error: siteErr } = await supabase
        .from("locations")
        .select("id,label,location_type")
        .eq("org_id", orgId)
        .eq("metadata->>demo_seed_package", pkg)
        .eq("location_type", "site");
    if (siteErr) throw new Error(`validation sites: ${siteErr.message}`);
    const siteRows = (demoSites ?? []) as Array<{ id: string; label: string | null }>;
    const siteLabelOrder = SITE_SPECS.map((s) => s.label) as string[];
    siteRows.sort((a, b) => {
        const ai = siteLabelOrder.indexOf(a.label ?? "");
        const bi = siteLabelOrder.indexOf(b.label ?? "");
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    const { data: demoRooms, error: roomErr } = await supabase
        .from("locations")
        .select("id,parent_location_id")
        .eq("org_id", orgId)
        .eq("metadata->>demo_seed_package", pkg)
        .eq("location_type", "unit")
        .eq("metadata->>semantic_kind", "classroom");
    if (roomErr) throw new Error(`validation rooms: ${roomErr.message}`);
    const rooms = (demoRooms ?? []) as Array<{ id: string; parent_location_id: string | null }>;
    const roomsPerSite: Record<string, number> = {};
    for (const s of siteRows) roomsPerSite[s.id] = 0;
    for (const r of rooms) {
        const pid = r.parent_location_id;
        if (pid && Object.prototype.hasOwnProperty.call(roomsPerSite, pid)) roomsPerSite[pid]++;
    }

    const byStatus = new Map<string, number>();
    for (const o of opps) {
        const k = (o.status_key ?? "").trim() || "(empty)";
        byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
    }

    const bySiteId = new Map<string, number>();
    for (const o of opps) {
        const lid = o.location_id ?? "";
        bySiteId.set(lid, (bySiteId.get(lid) ?? 0) + 1);
    }

    const personIds = [...new Set(opps.map((o) => o.primary_person_id).filter(Boolean))] as string[];
    const custIds = [...new Set(opps.map((o) => o.customer_id).filter(Boolean))] as string[];
    const locIds = [...new Set(opps.map((o) => o.location_id).filter(Boolean))] as string[];

    const personById = new Map<string, { email: string | null; phone: string | null; first_name: string | null; last_name: string | null }>();
    if (personIds.length) {
        const { data: persons, error } = await supabase.from("persons").select("id,email,phone,first_name,last_name").in("id", personIds);
        if (error) throw new Error(`validation persons: ${error.message}`);
        for (const p of persons ?? []) {
            const row = p as { id: string; email: string | null; phone: string | null; first_name: string | null; last_name: string | null };
            personById.set(row.id, row);
        }
    }

    const customerById = new Map<string, { name: string | null }>();
    if (custIds.length) {
        const { data: customers, error } = await supabase.from("customers").select("id,name").in("id", custIds);
        if (error) throw new Error(`validation customers: ${error.message}`);
        for (const c of customers ?? []) {
            const row = c as { id: string; name: string | null };
            customerById.set(row.id, row);
        }
    }

    const locationById = new Map<string, { label: string | null }>();
    const allLocIds = [...new Set([...locIds, ...siteRows.map((s) => s.id)])];
    if (allLocIds.length) {
        const { data: locs, error } = await supabase.from("locations").select("id,label").in("id", allLocIds);
        if (error) throw new Error(`validation locations: ${error.message}`);
        for (const l of locs ?? []) {
            const row = l as { id: string; label: string | null };
            locationById.set(row.id, row);
        }
    }

    const wuIds = [...new Set(opps.map((o) => o.work_unit_id).filter(Boolean))] as string[];
    const wuDept = new Map<string, string | null>();
    if (wuIds.length) {
        const { data: wus, error } = await supabase.from("work_units").select("id,department_id").in("id", wuIds);
        if (error) throw new Error(`validation work_units: ${error.message}`);
        for (const w of wus ?? []) {
            const row = w as { id: string; department_id: string | null };
            wuDept.set(row.id, row.department_id);
        }
    }

    const oppIds = opps.map((o) => o.id);
    const quotesByOpp = new Map<string, number>();
    if (oppIds.length) {
        const chunk = 200;
        for (let i = 0; i < oppIds.length; i += chunk) {
            const slice = oppIds.slice(i, i + chunk);
            const { data: qs, error } = await supabase.from("quotes").select("opportunity_id,total_cents").in("opportunity_id", slice);
            if (error) throw new Error(`validation quotes: ${error.message}`);
            for (const q of qs ?? []) {
                const row = q as { opportunity_id: string | null; total_cents: number | null };
                if (!row.opportunity_id) continue;
                const prev = quotesByOpp.get(row.opportunity_id) ?? 0;
                const val = row.total_cents ?? 0;
                quotesByOpp.set(row.opportunity_id, Math.max(prev, val));
            }
        }
    }

    const childNamesByOpp = new Map<string, string[]>();
    if (oppIds.length) {
        const chunk = 100;
        for (let i = 0; i < oppIds.length; i += chunk) {
            const slice = oppIds.slice(i, i + chunk);
            const { data: ocm, error } = await supabase
                .from("opportunity_customer_members")
                .select("opportunity_id, customer_members(display_name, relationship, is_active)")
                .eq("org_id", orgId)
                .in("opportunity_id", slice);
            if (error) throw new Error(`validation ocm: ${error.message}`);
            for (const row of ocm ?? []) {
                const r = row as { opportunity_id: string; customer_members: unknown };
                let cmRaw = r.customer_members;
                if (Array.isArray(cmRaw)) cmRaw = cmRaw[0];
                const cm = cmRaw as {
                    display_name: string | null;
                    relationship: string | null;
                    is_active: boolean | null;
                } | null;
                if (!cm || cm.relationship !== "child" || cm.is_active === false) continue;
                const name = (cm.display_name ?? "").trim();
                const arr = childNamesByOpp.get(r.opportunity_id) ?? [];
                if (name) arr.push(name);
                childNamesByOpp.set(r.opportunity_id, arr);
            }
        }
    }

    let missingEmail = 0;
    let missingPhone = 0;
    let missingChildName = 0;
    let missingCustomerPersonLink = 0;
    let missingLocationId = 0;
    let missingWorkUnit = 0;
    let missingDepartmentId = 0;
    let missingDesiredStart = 0;
    let missingNextFollowUp = 0;
    let missingNotesOrNextStep = 0;
    let missingQuoteValue = 0;

    for (const o of opps) {
        const person = o.primary_person_id ? personById.get(o.primary_person_id) : undefined;
        const email = (person?.email ?? "").trim();
        const phone = (person?.phone ?? "").trim();
        if (!email) missingEmail++;
        if (!phone) missingPhone++;

        const kids = childNamesByOpp.get(o.id) ?? [];
        if (kids.length === 0) missingChildName++;

        if (!o.customer_id || !o.primary_person_id) missingCustomerPersonLink++;
        if (!o.location_id) missingLocationId++;
        if (!o.work_unit_id) missingWorkUnit++;
        else {
            const did = wuDept.get(o.work_unit_id);
            if (!did) missingDepartmentId++;
        }

        const md = asMetaRecord(o.metadata);
        if (!mdString(md, "desired_start_date")?.trim()) missingDesiredStart++;
        if (!mdString(md, "next_follow_up_at")?.trim()) missingNextFollowUp++;
        const hasNotes = !!(mdString(md, "notes")?.trim() || mdString(md, "demo_note")?.trim());
        const hasNext = !!(mdString(md, "next_step")?.trim());
        if (!hasNotes || !hasNext) missingNotesOrNextStep++;

        const sk = (o.status_key ?? "").trim();
        if (PRICED_STATUS_KEYS.has(sk)) {
            const qCents = quotesByOpp.get(o.id) ?? 0;
            if (!effectiveQuotePresent(o, qCents)) missingQuoteValue++;
        }
    }

    const { data: seededCustomers, error: scErr } = await supabase.from("customers").select("id").eq("org_id", orgId).eq("metadata->>demo_seed_package", pkg);
    if (scErr) throw new Error(`validation seeded customers: ${scErr.message}`);
    const seedCustomerIds = (seededCustomers ?? []).map((c) => (c as { id: string }).id);
    let child1 = 0;
    let child2 = 0;
    let child3p = 0;
    let singleGuardian = 0;
    let twoGuardians = 0;
    let threePlusGuardians = 0;
    let grandparentHouseholds = 0;

    if (seedCustomerIds.length) {
        const { data: members, error: memErr } = await supabase
            .from("customer_members")
            .select("customer_id, relationship, is_active")
            .eq("org_id", orgId)
            .in("customer_id", seedCustomerIds);
        if (memErr) throw new Error(`validation members: ${memErr.message}`);
        const activeChildrenPerCustomer = new Map<string, number>();
        for (const m of members ?? []) {
            const row = m as { customer_id: string; relationship: string | null; is_active: boolean | null };
            if (row.relationship !== "child" || row.is_active === false) continue;
            activeChildrenPerCustomer.set(row.customer_id, (activeChildrenPerCustomer.get(row.customer_id) ?? 0) + 1);
        }
        for (const [, n] of activeChildrenPerCustomer) {
            if (n === 1) child1++;
            else if (n === 2) child2++;
            else if (n >= 3) child3p++;
        }

        const { data: cpsRows, error: cpErr2 } = await supabase
            .from("customer_persons")
            .select("customer_id, role_type, person_id")
            .eq("org_id", orgId)
            .in("customer_id", seedCustomerIds);
        if (cpErr2) throw new Error(`validation customer_persons: ${cpErr2.message}`);
        const guardianPersonIds = new Set<string>();
        const guardiansByCustomer = new Map<string, string[]>();
        for (const row of cpsRows ?? []) {
            const r = row as { customer_id: string; role_type: string; person_id: string };
            if (r.role_type !== "guardian") continue;
            guardianPersonIds.add(r.person_id);
            const arr = guardiansByCustomer.get(r.customer_id) ?? [];
            arr.push(r.person_id);
            guardiansByCustomer.set(r.customer_id, arr);
        }
        const lastByPerson = new Map<string, string | null>();
        if (guardianPersonIds.size) {
            const gpIds = [...guardianPersonIds];
            const chunk = 150;
            for (let i = 0; i < gpIds.length; i += chunk) {
                const slice = gpIds.slice(i, i + chunk);
                const { data: plist, error } = await supabase.from("persons").select("id,last_name").in("id", slice);
                if (error) throw new Error(`validation guardian persons: ${error.message}`);
                for (const p of plist ?? []) {
                    const pr = p as { id: string; last_name: string | null };
                    lastByPerson.set(pr.id, pr.last_name);
                }
            }
        }
        for (const cid of seedCustomerIds) {
            const gCount = (guardiansByCustomer.get(cid) ?? []).length;
            if (gCount === 1) singleGuardian++;
            else if (gCount === 2) twoGuardians++;
            else if (gCount >= 3) threePlusGuardians++;

            const gPersons = guardiansByCustomer.get(cid) ?? [];
            const hasWalsh = gPersons.some((pid) => (lastByPerson.get(pid) ?? "").trim() === "Walsh");
            if (hasWalsh) grandparentHouseholds++;
        }
    }

    type VisibleBag = { name: string; customerName: string; primaryLine: string; children: string; site: string; notes: string; nextStep: string; programLabel: string };
    const visibleRows: VisibleBag[] = [];
    for (const o of opps) {
        const person = o.primary_person_id ? personById.get(o.primary_person_id) : undefined;
        const primaryLine = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
        const md = asMetaRecord(o.metadata);
        visibleRows.push({
            name: (o.name ?? "").trim(),
            customerName: (o.customer_id ? (customerById.get(o.customer_id)?.name ?? "") : "").trim(),
            primaryLine,
            children: (childNamesByOpp.get(o.id) ?? []).join(", "),
            site: (o.location_id ? (locationById.get(o.location_id)?.label ?? "") : "").trim(),
            notes: (mdString(md, "notes") ?? mdString(md, "demo_note") ?? "").trim(),
            nextStep: (mdString(md, "next_step") ?? "").trim(),
            programLabel: (mdString(md, "program_label") ?? "").trim(),
        });
    }

    const forbiddenCounts: Record<string, number> = {};
    for (const p of FORBIDDEN_VISIBLE_SUBSTRINGS) {
        const needle = p.toLowerCase();
        let c = 0;
        for (const r of visibleRows) {
            const bag = [r.name, r.customerName, r.primaryLine, r.children, r.site, r.notes, r.nextStep, r.programLabel].join("\n").toLowerCase();
            if (bag.includes(needle)) c++;
        }
        forbiddenCounts[p] = c;
    }

    const { data: qaMembers, error: qaMemErr } = await supabase
        .from("customer_members")
        .select("dob,metadata")
        .eq("org_id", orgId)
        .eq("metadata->>demo_seed_package", pkg)
        .eq("relationship", "child")
        .eq("is_active", true);
    if (qaMemErr) throw new Error(`validation QA members: ${qaMemErr.message}`);
    let childProgramMismatches = 0;
    let childRowsChecked = 0;
    for (const raw of qaMembers ?? []) {
        const row = raw as { dob: string | null; metadata: unknown };
        const dob = String(row.dob ?? "").trim();
        if (!dob) continue;
        childRowsChecked++;
        const cm = asMetaRecord(row.metadata as Record<string, unknown>);
        const stored = (mdString(cm, "program_label") ?? "").trim();
        const expected = programLabelAndAgeGroupFromAgeMonths(approximateAgeMonthsFromDobIso(dob) ?? 0).program_label;
        if (stored !== expected) childProgramMismatches++;
    }

    let tourDateMissingTime = 0;
    let notesMissingAt = 0;
    let notesBodyHasLeadingTimestamp = 0;
    let notePreviewWouldDuplicateTimestamp = 0;
    let multiChildHomogeneousPrograms = 0;
    for (const o of opps) {
        const md = asMetaRecord(o.metadata);
        const td = (mdString(md, "tour_date") ?? "").trim();
        const tt = (mdString(md, "tour_time") ?? "").trim();
        if (td && !tt) tourDateMissingTime++;
        const n = (mdString(md, "notes") ?? mdString(md, "demo_note") ?? "").trim();
        const na = (mdString(md, "notes_at") ?? "").trim();
        if (n && !na) notesMissingAt++;
        if (n && looksLikeLeadingNoteTimestamp(n)) notesBodyHasLeadingTimestamp++;
        if (na && n && /^\d{1,2}:\d{2}\s*(?:AM|PM)\s+—\s+/i.test(n)) notePreviewWouldDuplicateTimestamp++;
        const ic = md?.inquiry_children;
        if (Array.isArray(ic) && ic.length >= 2) {
            const labs = ic
                .map((row) => {
                    const r = row as Record<string, unknown>;
                    return typeof r.program_label === "string" ? r.program_label.trim() : "";
                })
                .filter(Boolean);
            if (labs.length >= 2 && new Set(labs).size === 1) multiChildHomogeneousPrograms++;
        }
    }

    const nowQa = new Date();
    let needsAttentionHits = 0;
    for (const o of opps) {
        if (
            queueServiceTesting.opportunityNeedsAttention(
                {
                    updated_at: o.updated_at,
                    primary_person_id: o.primary_person_id,
                    primary_contact_id: o.primary_contact_id,
                    customer_id: o.customer_id,
                    status_key: o.status_key,
                    metadata: asMetaRecord(o.metadata) as Record<string, unknown> | null,
                },
                nowQa
            )
        ) {
            needsAttentionHits++;
        }
    }
    const naPct = opps.length ? (100 * needsAttentionHits) / opps.length : 0;

    const { count: demoCommThreadCount } = await supabase
        .from("communication_threads")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("metadata->>demo_realistic_comm", "1");

    const { count: demoCommMessageCount } = await supabase
        .from("communication_messages")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("metadata->>demo_seed_kind", DEMO_COMM_MSG_META.demo_seed_kind);

    const { data: orgTzRow } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
    const orgMeta = asMetaRecord((orgTzRow as { metadata?: unknown } | null)?.metadata ?? null);
    const orgTz = (mdString(orgMeta, "timezone") ?? mdString(orgMeta, "time_zone") ?? "").trim() || "(unset — Admin previews fall back to UTC)";

    console.log("\n--- SEED VALIDATION SUMMARY ---\n");
    console.log("A. Volume");
    console.log(`- org display/operational timezone (org_settings.metadata): ${orgTz}`);
    console.log(`- total opportunities: ${opps.length}`);
    console.log(`- demo communication threads (canonical, seeded): ${demoCommThreadCount ?? 0}`);
    console.log(`- demo communication messages (canonical, seeded): ${demoCommMessageCount ?? 0}`);
    for (const s of siteRows) {
        const n = bySiteId.get(s.id) ?? 0;
        console.log(`- opportunities at ${s.label ?? s.id}: ${n}`);
    }
    for (const s of siteRows) {
        console.log(`- rooms at ${s.label ?? s.id}: ${roomsPerSite[s.id] ?? 0}`);
    }
    console.log(`- total customers (seed package): ${custCount ?? 0}`);
    console.log(`- total persons (seed package): ${personCount ?? 0}`);

    console.log("\nB. Status distribution (status_key)");
    if (opps.length === 0) {
        console.log("- (no rows)");
    } else {
        for (const k of PIPELINE_STATUS_ORDER) {
            console.log(`- ${k}: ${byStatus.get(k) ?? 0}`);
        }
        const extras = [...byStatus.keys()].filter((k) => !PIPELINE_STATUS_ORDER.includes(k)).sort();
        if (extras.length) {
            console.log("- (other status_key values)");
            for (const k of extras) {
                console.log(`- ${k}: ${byStatus.get(k) ?? 0}`);
            }
        }
    }

    console.log("\nB2. Status distribution by site");
    if (siteRows.length === 0) {
        console.log("- (no demo sites found)");
    } else {
        for (const s of siteRows) {
            const label = s.label ?? s.id;
            console.log(`- ${label} by status_key:`);
            const siteOpps = opps.filter((o) => o.location_id === s.id);
            const sm = new Map<string, number>();
            for (const o of siteOpps) {
                const k = (o.status_key ?? "").trim() || "(empty)";
                sm.set(k, (sm.get(k) ?? 0) + 1);
            }
            for (const k of PIPELINE_STATUS_ORDER) {
                console.log(`  - ${k}: ${sm.get(k) ?? 0}`);
            }
            const siteExtras = [...sm.keys()].filter((k) => !PIPELINE_STATUS_ORDER.includes(k)).sort();
            for (const k of siteExtras) {
                console.log(`  - ${k}: ${sm.get(k) ?? 0}`);
            }
        }
    }

    console.log("\nC. Required field completeness (missing counts among seeded opportunities)");
    console.log(`- missing email (primary person): ${missingEmail}`);
    console.log(`- missing phone (primary person): ${missingPhone}`);
    console.log(`- missing child name (no active child join): ${missingChildName}`);
    console.log(`- missing customer_id or primary_person_id: ${missingCustomerPersonLink}`);
    console.log(`- missing location_id: ${missingLocationId}`);
    console.log(`- missing work_unit_id: ${missingWorkUnit}`);
    console.log(`- missing department_id (via work_unit): ${missingDepartmentId}`);
    console.log(`- missing desired_start_date (metadata): ${missingDesiredStart}`);
    console.log(`- missing next_follow_up_at (metadata): ${missingNextFollowUp}`);
    console.log(`- missing notes OR next_step (metadata): ${missingNotesOrNextStep}`);
    console.log(`- missing quote/value for enrolled|enrolling (quote_total / cents / quotes row): ${missingQuoteValue}`);

    console.log("\nD. Household mix (customers with this seed package)");
    console.log(`- 1 child households: ${child1}`);
    console.log(`- 2 child households: ${child2}`);
    console.log(`- 3+ child households: ${child3p}`);
    console.log(`- single guardian on account: ${singleGuardian}`);
    console.log(`- two guardian contacts on account: ${twoGuardians}`);
    console.log(`- three+ guardian contacts on account: ${threePlusGuardians}`);
    console.log(`- households with Walsh guardian (seed grandparent): ${grandparentHouseholds}`);

    console.log("\nE. Forbidden string check (visible fields only; not raw metadata JSON)");
    for (const p of FORBIDDEN_VISIBLE_SUBSTRINGS) {
        console.log(`- opportunities with "${p}" in monitored visible text: ${forbiddenCounts[p] ?? 0}`);
    }

    console.log("\nF. QA alignment (child program vs DOB, tour time, notes_at, needs_attention)");
    console.log(`- child customer_members with DOB checked: ${childRowsChecked}`);
    console.log(`- child rows where metadata.program_label ≠ DOB-derived tier: ${childProgramMismatches}`);
    console.log(`- opportunities with tour_date but no tour_time: ${tourDateMissingTime}`);
    console.log(`- opportunities with notes/demo_note but no notes_at: ${notesMissingAt}`);
    console.log(`- opportunities where note body still begins with date/time prefix: ${notesBodyHasLeadingTimestamp}`);
    console.log(`- opportunities where notes_at + body-time would render duplicate timestamps: ${notePreviewWouldDuplicateTimestamp}`);
    console.log(
        `- opportunities with 2+ inquiry_children sharing one program_label (should be 0 after tiered DOB seed/patch): ${multiChildHomogeneousPrograms}`
    );
    console.log(`- needs_attention (QueueService rules, now): ${needsAttentionHits} / ${opps.length} (${naPct.toFixed(1)}%)`);

    console.log("\nG. Sample opportunities (first 5 by created_at)");
    const sample = opps.slice(0, 5);
    for (let i = 0; i < sample.length; i++) {
        const o = sample[i]!;
        const person = o.primary_person_id ? personById.get(o.primary_person_id) : undefined;
        const primary = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim() || "(none)";
        const kids = (childNamesByOpp.get(o.id) ?? []).join(", ") || "(none)";
        const site = (o.location_id ? locationById.get(o.location_id)?.label : null) ?? "(none)";
        const md = asMetaRecord(o.metadata);
        console.log(`  [${i + 1}] title: ${(o.name ?? "").trim()}`);
        console.log(`      status_key: ${(o.status_key ?? "").trim() || "(empty)"}`);
        console.log(`      site: ${site}`);
        console.log(`      primary contact: ${primary}`);
        console.log(`      child name(s): ${kids}`);
        console.log(`      next step: ${(mdString(md, "next_step") ?? "").trim() || "(empty)"}`);
    }
    if (sample.length === 0) console.log("  (none)");
}

async function wireDemoUserScopes(
    supabase: SupabaseAdmin,
    orgId: string,
    northId: string,
    southId: string,
    enrollmentDeptId: string
): Promise<void> {
    const corp = process.env.DEMO_CORPORATE_USER_ID?.trim();
    const regional = process.env.DEMO_REGIONAL_USER_ID?.trim();
    const director = process.env.DEMO_DIRECTOR_USER_ID?.trim();

    if (corp) {
        await ensureUserRoleIfAbsent(supabase, orgId, corp, "admin");
        await applyUserAccessProfile(supabase, orgId, corp, "all", "all", [], []);
    }
    if (regional) {
        await ensureUserRoleIfAbsent(supabase, orgId, regional, "ops");
        await ensureUserRoleIfAbsent(supabase, orgId, regional, "regional_lead");
        await applyUserAccessProfile(supabase, orgId, regional, "all", "restricted", [], [northId, southId]);
    }
    if (director) {
        await ensureUserRoleIfAbsent(supabase, orgId, director, "ops");
        await ensureUserRoleIfAbsent(supabase, orgId, director, "school_director");
        await applyUserAccessProfile(supabase, orgId, director, "restricted", "restricted", [enrollmentDeptId], [northId]);
    }
}

const TOUR_METADATA_STATUS_KEYS = new Set(["tour_scheduled", "tour_completed", "enrolling", "waitlisted", "enrolled"]);

function childDisplayFromMemberSeed(m: {
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
}): string {
    const d = String(m.display_name ?? "").trim();
    if (d) return d;
    return [String(m.first_name ?? "").trim(), String(m.last_name ?? "").trim()].filter(Boolean).join(" ").trim();
}

/**
 * Idempotent backfill for already-seeded orgs: realign `metadata.inquiry_children` and member program metadata
 * from authoritative DOB, add missing `tour_time` / `notes_at`, and refresh opportunity-level program summary.
 * Does not delete rows or rerun the 135-family generator.
 */
async function runMetadataPatchMain(): Promise<void> {
    const orgId = requireEnv("DEMO_RESET_ORG_ID");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }
    const supabase = createAdminClient();
    const pkg = STAGING_REALISTIC_CHILDCARE_SEED_PACKAGE;
    console.log(
        "\n[seed:patch-metadata] Idempotent CRM metadata backfill (inquiry_children, member program fields, tour_time, notes_at).\n"
    );
    const { data: oppsRaw, error } = await supabase
        .from("opportunities")
        .select("id,status_key,metadata,created_at")
        .eq("org_id", orgId)
        .eq("metadata->>demo_seed_package", pkg);
    if (error) throw new Error(error.message);
    const opps = (oppsRaw ?? []) as Array<{
        id: string;
        status_key: string | null;
        metadata: unknown;
        created_at: string | null;
    }>;
    const orgTz = await (async () => {
        const { data: orgRow } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
        const meta = asMetaRecord((orgRow as { metadata?: unknown } | null)?.metadata ?? null);
        const tz = (mdString(meta, "timezone") ?? mdString(meta, "time_zone") ?? "").trim();
        return isValidIanaTimeZone(tz) ? tz : "America/Los_Angeles";
    })();
    console.log(`[seed:patch-metadata] Effective org timezone for note parsing: ${orgTz}`);
    let oppUpdates = 0;
    let memberTouch = 0;
    let notesBodiesWithLeadingPatternsBefore = 0;
    let notesBodiesWithLeadingPatternsAfter = 0;
    let notesAtAdjustedFromBody = 0;
    for (const o of opps) {
        const md = asMetaRecord(o.metadata);
        if (!md) continue;
        const { data: ocmRows } = await supabase
            .from("opportunity_customer_members")
            .select("customer_member_id")
            .eq("org_id", orgId)
            .eq("opportunity_id", o.id);
        const mids = [
            ...new Set(
                (ocmRows ?? [])
                    .map((r) => String((r as { customer_member_id?: string }).customer_member_id ?? "").trim())
                    .filter(Boolean)
            ),
        ];
        const inquiry_children: Record<string, unknown>[] = [];
        if (mids.length) {
            const { data: mems, error: memErr } = await supabase
                .from("customer_members")
                .select("id,display_name,first_name,last_name,dob,person_id,metadata,relationship,is_active")
                .eq("org_id", orgId)
                .in("id", mids);
            if (memErr) throw new Error(memErr.message);
            const members = (mems ?? []) as Array<{
                id: string;
                display_name: string | null;
                first_name: string | null;
                last_name: string | null;
                dob: string | null;
                person_id: string | null;
                metadata: unknown;
                relationship: string | null;
                is_active: boolean | null;
            }>;
            const childRows = members.filter((m) => m.relationship === "child" && m.is_active !== false);
            const pids = [...new Set(childRows.map((m) => String(m.person_id ?? "").trim()).filter(Boolean))];
            const dobByPerson = new Map<string, string>();
            if (pids.length) {
                const { data: plist, error: pErr } = await supabase
                    .from("persons")
                    .select("id,date_of_birth")
                    .eq("org_id", orgId)
                    .in("id", pids);
                if (pErr) throw new Error(pErr.message);
                for (const pr of plist ?? []) {
                    const row = pr as { id: string; date_of_birth: string | null };
                    const d = String(row.date_of_birth ?? "").trim();
                    if (d) dobByPerson.set(row.id, d);
                }
            }
            const sorted = [...childRows].sort((a, b) =>
                childDisplayFromMemberSeed(a).toLowerCase().localeCompare(childDisplayFromMemberSeed(b).toLowerCase())
            );
            for (const m of sorted) {
                const canonicalDob = (m.person_id ? dobByPerson.get(m.person_id) : "") || String(m.dob ?? "").trim();
                const months = approximateAgeMonthsFromDobIso(canonicalDob) ?? 24;
                const { program_label, age_group } = programLabelAndAgeGroupFromAgeMonths(months);
                const display_name = childDisplayFromMemberSeed(m);
                const dobOut =
                    canonicalDob.length >= 10 ? canonicalDob.slice(0, 10) : canonicalDob ? canonicalDob : "";
                inquiry_children.push({
                    display_name,
                    program_label,
                    age_group,
                    ...(dobOut ? { dob: dobOut } : {}),
                });
                const prevMeta = asMetaRecord(m.metadata as Record<string, unknown> | null) ?? {};
                if ((mdString(prevMeta, "program_label") ?? "").trim() !== program_label || (mdString(prevMeta, "age_group") ?? "").trim() !== age_group) {
                    const nextMemberMeta = { ...prevMeta, program_label, age_group };
                    const { error: upM } = await supabase
                        .from("customer_members")
                        .update({ metadata: nextMemberMeta as never })
                        .eq("id", m.id)
                        .eq("org_id", orgId);
                    if (upM) throw new Error(`customer_members ${m.id}: ${upM.message}`);
                    memberTouch++;
                }
            }
        }

        const nextMd: Record<string, unknown> = { ...md };
        if (inquiry_children.length) {
            nextMd.inquiry_children = inquiry_children;
            const uniqProg = [...new Set(inquiry_children.map((ic) => String(ic.program_label ?? "").trim()).filter(Boolean))];
            nextMd.program_label = uniqProg.length > 1 ? uniqProg.join(" · ") : uniqProg[0] ?? md.program_label;
            nextMd.age_group =
                uniqProg.length > 1
                    ? ""
                    : typeof inquiry_children[0]?.age_group === "string"
                      ? inquiry_children[0].age_group
                      : md.age_group;
        }

        const td = (mdString(nextMd, "tour_date") ?? "").trim();
        const tt0 = (mdString(nextMd, "tour_time") ?? "").trim();
        const sk = (o.status_key ?? "").trim();
        if (td && TOUR_METADATA_STATUS_KEYS.has(sk) && !tt0) {
            const seedKey = mdString(asMetaRecord(nextMd), "seed_key") ?? o.id;
            nextMd.tour_time = buildSeedTourTime(hash32(seedKey));
        }

        const noteTextRaw = (mdString(nextMd, "notes") ?? "").trim();
        const demoNoteRaw = (mdString(nextMd, "demo_note") ?? "").trim();
        if (noteTextRaw && looksLikeLeadingNoteTimestamp(noteTextRaw)) notesBodiesWithLeadingPatternsBefore++;
        if (demoNoteRaw && looksLikeLeadingNoteTimestamp(demoNoteRaw)) notesBodiesWithLeadingPatternsBefore++;
        const na0 = (mdString(nextMd, "notes_at") ?? "").trim();
        const fallbackYmd = (() => {
            const refIso = na0 || (o.created_at && String(o.created_at).trim() ? String(o.created_at).trim() : "");
            if (!refIso) return null;
            const ms = Date.parse(refIso);
            if (!Number.isFinite(ms)) return null;
            // Date component in org TZ.
            const d = new Date(ms);
            const parts = new Intl.DateTimeFormat("en-CA", { timeZone: orgTz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
            const y = parts.find((p) => p.type === "year")?.value;
            const m = parts.find((p) => p.type === "month")?.value;
            const day = parts.find((p) => p.type === "day")?.value;
            return y && m && day ? `${y}-${m}-${day}` : null;
        })();
        const candidateForTimestamp = noteTextRaw || demoNoteRaw;
        if (candidateForTimestamp) {
            const extracted = extractBestNoteTimestampAndBody({
                raw: candidateForTimestamp,
                fallbackYmd,
                timeZoneIana: orgTz,
            });
            const bodyPlain = extracted.body;
            if (bodyPlain && looksLikeLeadingNoteTimestamp(bodyPlain)) notesBodiesWithLeadingPatternsAfter++;
            if (noteTextRaw) nextMd.notes = bodyPlain;
            if (demoNoteRaw) nextMd.demo_note = bodyPlain;
            if (extracted.notesAtIso && extracted.notesAtIso !== na0) {
                nextMd.notes_at = extracted.notesAtIso;
                notesAtAdjustedFromBody++;
            } else if (!na0) {
                const ca = o.created_at && String(o.created_at).trim() ? String(o.created_at).trim() : null;
                nextMd.notes_at = ca ?? isoDate(new Date());
            }
        }

        const changed =
            JSON.stringify(md.inquiry_children ?? null) !== JSON.stringify(nextMd.inquiry_children ?? null) ||
            (mdString(md, "program_label") ?? "").trim() !== (mdString(nextMd, "program_label") ?? "").trim() ||
            (mdString(md, "age_group") ?? "").trim() !== (mdString(nextMd, "age_group") ?? "").trim() ||
            (mdString(md, "tour_time") ?? "").trim() !== (mdString(nextMd, "tour_time") ?? "").trim() ||
            (mdString(md, "notes_at") ?? "").trim() !== (mdString(nextMd, "notes_at") ?? "").trim() ||
            (mdString(md, "notes") ?? "").trim() !== (mdString(nextMd, "notes") ?? "").trim() ||
            (mdString(md, "demo_note") ?? "").trim() !== (mdString(nextMd, "demo_note") ?? "").trim();

        if (changed) {
            const patch = { metadata: nextMd, updated_at: isoDate(new Date()) };
            const { error: upO } = await supabase.from("opportunities").update(patch as never).eq("id", o.id).eq("org_id", orgId);
            if (upO) throw new Error(`opportunities ${o.id}: ${upO.message}`);
            oppUpdates++;
        }
    }
    console.log(`[seed:patch-metadata] Opportunities updated: ${oppUpdates} / ${opps.length}`);
    console.log(`[seed:patch-metadata] customer_members metadata program touch count: ${memberTouch}`);
    console.log(`[seed:patch-metadata] note bodies with leading date/time patterns (before): ${notesBodiesWithLeadingPatternsBefore}`);
    console.log(`[seed:patch-metadata] note bodies with leading date/time patterns (after strip): ${notesBodiesWithLeadingPatternsAfter}`);
    console.log(`[seed:patch-metadata] notes_at adjusted from note body timestamp: ${notesAtAdjustedFromBody}`);
    await printSeedValidationSummary(supabase, orgId);
    console.log("[seed:patch-metadata] Done.");
}

async function runScopesOnlyMain(): Promise<void> {
    const orgId = requireEnv("DEMO_RESET_ORG_ID");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }
    console.log("\n[seed:scopes-only] Wiring DEMO_* user roles + access profiles only (no family reseed).\n");
    const supabase = createAdminClient();
    const siteIds: string[] = [];
    for (const s of SITE_SPECS) {
        siteIds.push(await ensureSite(supabase, orgId, s.seedKey, s.label));
    }
    const northId = siteIds[0]!;
    const southId = siteIds[1]!;

    const { data: enrollmentDeptRow, error: enrollmentDeptErr } = await supabase
        .from("departments")
        .select("id")
        .eq("org_id", orgId)
        .eq("key", "enrollment")
        .maybeSingle();
    if (enrollmentDeptErr || !(enrollmentDeptRow as { id?: string } | null)?.id) {
        throw new Error('Missing department key "enrollment" for user scope wiring.');
    }
    const enrollmentDeptId = (enrollmentDeptRow as { id: string }).id;

    await ensureStagingDemoTimezoneDefaults(supabase, orgId);
    await wireDemoUserScopes(supabase, orgId, northId, southId, enrollmentDeptId);
    console.log("\n[seed:scopes-only] Validation");
    console.log("- Mode: user_roles + user_access_profiles + department/site junctions only (no customers/opportunities touched).");
    console.log(`- DEMO_CORPORATE_USER_ID set: ${Boolean(process.env.DEMO_CORPORATE_USER_ID?.trim())}`);
    console.log(`- DEMO_REGIONAL_USER_ID set: ${Boolean(process.env.DEMO_REGIONAL_USER_ID?.trim())}`);
    console.log(`- DEMO_DIRECTOR_USER_ID set: ${Boolean(process.env.DEMO_DIRECTOR_USER_ID?.trim())}`);
    console.log("- Corporate wiring (when id set): all departments · all sites");
    console.log("- Regional wiring (when id set): all departments · North + South sites");
    console.log("- Director wiring (when id set): Enrollment department · North site only");
    console.log("[seed:scopes-only] Complete.");
}

async function applyUserAccessProfile(
    supabase: SupabaseAdmin,
    orgId: string,
    userId: string,
    department_scope: "all" | "restricted",
    site_scope: "all" | "restricted",
    department_ids: string[],
    site_location_ids: string[]
): Promise<void> {
    const { error: upErr } = await supabase.from("user_access_profiles").upsert(
        {
            user_id: userId,
            org_id: orgId,
            department_scope,
            site_scope,
        },
        { onConflict: "user_id,org_id" }
    );
    if (upErr) throw new Error(`user_access_profiles: ${upErr.message}`);

    await supabase.from("user_department_access").delete().eq("user_id", userId).eq("org_id", orgId);
    await supabase.from("user_site_access").delete().eq("user_id", userId).eq("org_id", orgId);

    if (department_scope === "restricted" && department_ids.length) {
        const { error } = await supabase
            .from("user_department_access")
            .insert(department_ids.map((department_id) => ({ user_id: userId, org_id: orgId, department_id })));
        if (error) throw new Error(`user_department_access: ${error.message}`);
    }
    if (site_scope === "restricted" && site_location_ids.length) {
        const { error } = await supabase
            .from("user_site_access")
            .insert(site_location_ids.map((location_id) => ({ user_id: userId, org_id: orgId, location_id })));
        if (error) throw new Error(`user_site_access: ${error.message}`);
    }
}

type SeedFamilyLoopCtx = { i: number; seedKey: string; site: string; statusKey: string };

/** Wraps a single DB step in the 135-family loop so Supabase failures include record context. */
async function runSeedDbStep<T>(table: string, ctx: SeedFamilyLoopCtx, fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[seed loop i=${ctx.i} seedKey=${ctx.seedKey} site=${ctx.site} status_key=${ctx.statusKey} table=${table}] ${msg}`);
    }
}

/**
 * Sets `org_settings.metadata.timezone` when absent and normalizes DEMO_* `user_profiles.timezone`
 * so AdminV2 queue/drawer previews resolve to a US-west wall clock by default (override with DEMO_STAGING_TIMEZONE).
 */
async function ensureStagingDemoTimezoneDefaults(supabase: SupabaseAdmin, orgId: string): Promise<void> {
    const raw = process.env.DEMO_STAGING_TIMEZONE?.trim() || "America/Los_Angeles";
    const iana = isValidIanaTimeZone(raw) ? raw : "America/Los_Angeles";

    const { data: existing, error: fetchErr } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
    if (fetchErr) throw new Error(`org_settings read: ${fetchErr.message}`);
    const cur = ((existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
    const existingTz = typeof cur.timezone === "string" ? cur.timezone.trim() : "";
    if (!existingTz || !isValidIanaTimeZone(existingTz)) {
        const next = { ...cur, timezone: iana };
        const { error: upErr } = await supabase.from("org_settings").upsert({ org_id: orgId, metadata: next } as never, { onConflict: "org_id" });
        if (upErr) throw new Error(`org_settings timezone: ${upErr.message}`);
    }

    const touchUser = async (uid: string | undefined) => {
        const id = uid?.trim();
        if (!id) return;
        const { data: prof, error: rErr } = await supabase.from("user_profiles").select("timezone").eq("id", id).maybeSingle();
        if (rErr) {
            console.warn(`[seed] user_profiles read ${id}: ${rErr.message}`);
            return;
        }
        const utz = typeof (prof as { timezone?: string | null } | null)?.timezone === "string" ? String((prof as { timezone: string }).timezone).trim() : "";
        if (utz && isValidIanaTimeZone(utz)) return;
        const { error: uErr } = await supabase.from("user_profiles").update({ timezone: iana }).eq("id", id);
        if (uErr) console.warn(`[seed] user_profiles timezone ${id}: ${uErr.message}`);
    };
    await touchUser(process.env.DEMO_CORPORATE_USER_ID);
    await touchUser(process.env.DEMO_REGIONAL_USER_ID);
    await touchUser(process.env.DEMO_DIRECTOR_USER_ID);
}

async function main(): Promise<void> {
    const orgId = requireEnv("DEMO_RESET_ORG_ID");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }

    const seedRunStarted = Date.now();
    console.log("\n[seed] Starting realistic childcare seed…");

    const totalOpps = 135;
    let phaseStart = Date.now();
    const statusPool = deterministicShuffleStatuses(buildStatusPool135(), orgId);
    runSeedPreflight(totalOpps, statusPool);
    console.log(`[seed] Preflight OK (${Date.now() - phaseStart}ms) — ${totalOpps} families planned`);

    const supabase = createAdminClient();
    const verticalId = await getChildcareVerticalId(supabase);

    phaseStart = Date.now();
    await ensureDepartment(supabase, orgId, "billing_operations", "Billing / Operations", "Tuition, billing, and family accounts.", 30);
    await ensureDepartment(supabase, orgId, "compliance", "Compliance", "Licensing, health records, and policy adherence.", 40);
    console.log(`[seed] Departments ensured (${Date.now() - phaseStart}ms)`);

    phaseStart = Date.now();
    const siteIds: string[] = [];
    for (const s of SITE_SPECS) {
        siteIds.push(await ensureSite(supabase, orgId, s.seedKey, s.label));
    }
    console.log(`[seed] Sites ensured (${Date.now() - phaseStart}ms) — ${SITE_SPECS.length} sites`);

    phaseStart = Date.now();
    let roomRows = 0;
    for (let si = 0; si < SITE_SPECS.length; si++) {
        const nRooms = 5 + modLength(hash32(`${SITE_SPECS[si]!.seedKey}:rooms`), 4);
        for (let r = 0; r < nRooms; r++) {
            const roomName = ROOM_NAMES[modLength(r, ROOM_NAMES.length)]!;
            await ensureRoom(supabase, orgId, siteIds[si]!, SITE_SPECS[si]!.seedKey, roomName, r);
            roomRows++;
        }
    }

    const workUnitId = await resolveEnrollmentWorkUnitId(supabase, orgId);

    const { data: enrollmentDeptRow, error: enrollmentDeptErr } = await supabase
        .from("departments")
        .select("id")
        .eq("org_id", orgId)
        .eq("key", "enrollment")
        .maybeSingle();
    if (enrollmentDeptErr || !(enrollmentDeptRow as { id?: string } | null)?.id) {
        throw new Error('Missing department key "enrollment" for user scope wiring.');
    }
    const enrollmentDeptId = (enrollmentDeptRow as { id: string }).id;
    console.log(
        `[seed] Locations / rooms / work-unit bootstrap done (${Date.now() - phaseStart}ms) — ${roomRows} classroom rows, enrollment work unit resolved`
    );

    phaseStart = Date.now();
    await ensureStagingDemoTimezoneDefaults(supabase, orgId);
    console.log(`[seed] Staging timezone defaults (${Date.now() - phaseStart}ms) — org + DEMO_* user_profiles when missing`);

    const northId = siteIds[0]!;
    const southId = siteIds[1]!;

    const plannedGlobal = countStatuses(statusPool);
    console.log("\n--- Status allocation (deterministic multiset + org-salted shuffle) ---");
    for (const k of PIPELINE_STATUS_ORDER) {
        console.log(`- ${k}: ${plannedGlobal.get(k) ?? 0}`);
    }
    const bySitePlanned: [Map<string, number>, Map<string, number>, Map<string, number>] = [new Map(), new Map(), new Map()];
    for (let i = 0; i < statusPool.length; i++) {
        const sk = statusPool[i]!;
        const m = bySitePlanned[i % 3]!;
        m.set(sk, (m.get(sk) ?? 0) + 1);
    }
    console.log("\nPlanned mix by site (shuffle order × round-robin site index i % 3):");
    for (let si = 0; si < 3; si++) {
        console.log(`- ${SITE_SPECS[si]!.label}:`);
        const m = bySitePlanned[si]!;
        for (const k of PIPELINE_STATUS_ORDER) {
            console.log(`  - ${k}: ${m.get(k) ?? 0}`);
        }
    }

    const siteLabelAt = (siteIdx: number) => SITE_SPECS[siteIdx]!.label;
    console.log(
        `\n[seed] Beginning ${totalOpps} families / opportunities (sequential Supabase calls per record; progress every 10)…`
    );

    phaseStart = Date.now();
    let quotesMs = 0;
    let quoteRows = 0;
    for (let i = 0; i < totalOpps; i++) {
        const p = plannedFamilyAtIndex(i, statusPool, siteLabelAt);
        const siteId = siteIds[p.siteIdx]!;
        const site = SITE_SPECS[p.siteIdx]!.label;
        const loopCtx: SeedFamilyLoopCtx = { i, seedKey: p.seedKey, site, statusKey: p.statusKey };

        if (i === 0 || (i + 1) % 10 === 0 || i + 1 === totalOpps) {
            console.log(`[seed] families progress: ${i + 1}/${totalOpps} (elapsed ${Date.now() - phaseStart}ms)`);
        }

        const customerId = await runSeedDbStep("customers", loopCtx, () =>
            ensureCustomer(supabase, orgId, `${p.seedKey}:customer`, p.customerName)
        );

        const g0Phone = formatPhone(p.seedKey, 0);
        const guardian0Id = await runSeedDbStep("persons", loopCtx, () =>
            ensurePerson(supabase, orgId, `${p.seedKey}:g0`, p.g0First, p.last, { email: p.g0Email, phone: g0Phone })
        );
        await runSeedDbStep("customer_persons", loopCtx, () =>
            ensureCustomerPerson(supabase, orgId, customerId, guardian0Id, "guardian", true, `${p.seedKey}:cp:guardian0`)
        );

        if (!p.singleParent && p.g1Email) {
            const g1Phone = formatPhone(p.seedKey, 1);
            const guardian1Id = await runSeedDbStep("persons", loopCtx, () =>
                ensurePerson(supabase, orgId, `${p.seedKey}:g1`, p.g1First, p.last, { email: p.g1Email, phone: g1Phone })
            );
            await runSeedDbStep("customer_persons", loopCtx, () =>
                ensureCustomerPerson(supabase, orgId, customerId, guardian1Id, "guardian", false, `${p.seedKey}:cp:guardian1`)
            );
        }

        const grandparent = p.grandparent;
        if (grandparent) {
            const gpId = await runSeedDbStep("persons", loopCtx, () =>
                ensurePerson(supabase, orgId, `${p.seedKey}:gp`, grandparent.first, grandparent.last, {
                    email: grandparent.email,
                    phone: formatPhone(p.seedKey, 2),
                })
            );
            await runSeedDbStep("customer_persons", loopCtx, () =>
                ensureCustomerPerson(supabase, orgId, customerId, gpId, "guardian", false, `${p.seedKey}:cp:grandparent`)
            );
        }

        const memberIds: string[] = [];
        for (let c = 0; c < p.childrenCount; c++) {
            const ch = p.children[c]!;
            const mk = `${p.seedKey}:child:${c}`;
            memberIds.push(
                await runSeedDbStep("customer_members", loopCtx, () =>
                    ensureCustomerMemberChild(supabase, orgId, customerId, mk, ch.first, ch.last, c)
                )
            );
        }

        const daysAgo = modLength(p.h, 120);
        const createdAt = new Date(Date.now() - daysAgo * 86400000);
        const inquiryChildrenMeta = inquiryChildrenRecordsForSeed(p);
        const tourEligibleRow = ["tour_scheduled", "tour_completed", "enrolling", "waitlisted", "enrolled"].includes(
            p.statusKey
        );
        const oppExtras: SeedOpportunityExtras = {
            inquiry_children: inquiryChildrenMeta,
            notes_at: isoDate(createdAt),
            tour_time: tourEligibleRow ? buildSeedTourTime(p.h) : null,
            force_stale_updated_at: modLength(p.h, 100) < 20,
        };
        const { id: oppId, tuitionCents } = await runSeedDbStep("opportunities", loopCtx, () =>
            ensureOpportunity(
                supabase,
                orgId,
                verticalId,
                workUnitId,
                p.seedKey,
                p.title,
                p.statusKey,
                guardian0Id,
                customerId,
                siteId,
                createdAt,
                p.note,
                oppExtras
            )
        );
        for (const mid of memberIds) {
            await runSeedDbStep("opportunity_customer_members", loopCtx, () =>
                ensureOppChildJoin(supabase, orgId, oppId, mid, `${p.seedKey}:ocm:${mid}`)
            );
        }

        const demoCommChannel: DemoCommChannel = modLength(p.h >>> 13, 2) === 0 ? "sms" : "email";
        await runSeedDbStep("communication_threads", loopCtx, () =>
            ensureDemoOpportunityCommunications(
                supabase,
                orgId,
                oppId,
                customerId,
                p.seedKey,
                p.h,
                createdAt,
                demoCommChannel,
                p.g0Email,
                g0Phone,
                site,
                p.g0First,
                p.title
            )
        );

        if (tuitionCents != null) {
            const q0 = Date.now();
            await runSeedDbStep("quotes", loopCtx, () =>
                ensureQuoteForOpportunity(supabase, orgId, oppId, p.seedKey, tuitionCents)
            );
            quotesMs += Date.now() - q0;
            quoteRows++;
        }
    }
    const familiesWallMs = Date.now() - phaseStart;
    console.log(`[seed] Families / opportunities loop done (${familiesWallMs}ms wall, sequential per record)`);
    console.log(`[seed] Quotes phase (within loop): ${quotesMs}ms across ${quoteRows} ensureQuoteForOpportunity call(s)`);

    phaseStart = Date.now();
    await wireDemoUserScopes(supabase, orgId, northId, southId, enrollmentDeptId);
    if (
        process.env.DEMO_CORPORATE_USER_ID?.trim() ||
        process.env.DEMO_REGIONAL_USER_ID?.trim() ||
        process.env.DEMO_DIRECTOR_USER_ID?.trim()
    ) {
        console.log(`[seed] User scope / roles wiring done (${Date.now() - phaseStart}ms)`);
    } else {
        console.log(`[seed] User scope / roles skipped (no DEMO_*_USER_ID set) (${Date.now() - phaseStart}ms)`);
    }

    console.log("\n--- Seed complete ---");
    console.log(`org_id: ${orgId}`);
    console.log(`package: ${STAGING_REALISTIC_CHILDCARE_SEED_PACKAGE}`);
    console.log(`opportunities (target): ${totalOpps}`);
    console.log(`sites: ${SITE_SPECS.map((s) => s.label).join(", ")}`);
    console.log(`[seed] Total wall time so far: ${Date.now() - seedRunStarted}ms`);

    phaseStart = Date.now();
    console.log("\n[seed] Starting validation summary…");
    await printSeedValidationSummary(supabase, orgId);
    console.log(`[seed] Validation summary finished (${Date.now() - phaseStart}ms)`);
    console.log(`[seed] Done. Total wall time: ${Date.now() - seedRunStarted}ms`);
}

const argv = new Set(process.argv.slice(2));
if (argv.has("--patch-metadata")) {
    runMetadataPatchMain().catch((e) => {
        console.error(e);
        process.exit(1);
    });
} else if (argv.has("--scopes-only")) {
    runScopesOnlyMain().catch((e) => {
        console.error(e);
        process.exit(1);
    });
} else {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
