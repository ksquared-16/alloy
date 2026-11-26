/**
 * Firefly staging seed — the known dataset (ALY-14 E2).
 *
 * WHAT IS MIRRORED, AND FROM WHERE. Configuration only, from the repository's own census evidence of
 * the live Firefly tenant — never a row of it:
 *
 *   sites + rooms      3 campuses, 17 rooms, capacity / ratio / age group
 *                      certification/locations/legacy-capacity-convergence-census.sql.results.json (2026-09-19)
 *   programs           infant, toddler, preschool, pre_k, school_age at every campus; kindergarten at North
 *                      certification/financials/11a-fx/catalog.json (2026-09-18)
 *   offerings + rates  monthly private-pay org-default rates by days per week
 *                      certification/financials/11a-fx/plans.json,
 *                      web/tests/fixtures/commercial/stagingToddlerPreschoolCatalog.json (2026-10-20)
 *   registration fee   `registration_fee`, $75 per child, fixed
 *                      certification/enrollment/v05-final-integrity (2026-10-30)
 *
 * QA debris the live tenant carries (`stage4_ok3_*` categories, the North site rate overrides, the
 * `Cert Enrollment/Consent <timestamp>` forms) is deliberately absent.
 *
 * WHAT IS SYNTHETIC. Every household, guardian and child. Names are drawn from fixed lists — tree
 * surnames, so a seeded family can never be mistaken for a real one — emails use the reserved
 * `.invalid` TLD (RFC 2606) and phones the NANP fictional block 555-01XX, both of which the ALY-14
 * staging outbound guard already treats as test recipients. Addresses use "Example" streets.
 *
 * VISIBLY SYNTHETIC. Every name the application shows on its own — the household, the family case and
 * each child's display name — carries SEED_DISPLAY_MARKER, so a seeded record reads as synthetic in any
 * list, lane card or search result without opening it (ALY-14 E3). Guardians are always shown inside
 * their marked household and keep plain names, so emails stay derived from the surname.
 *
 * DETERMINISTIC. No clock, no randomness: every date is an offset from SEED_ANCHOR_DATE, and every
 * id comes from ./ids. Rendering this twice produces byte-identical SQL (tested).
 */

import { SEED_WORK_UNIT_IDS, seedId } from "./ids";

/** Every seeded date is relative to this day. Changing it is a deliberate, reviewed re-baseline. */
export const SEED_ANCHOR_DATE = "2026-11-02" as const;

export type SeedSite = {
    n: number;
    key: "north" | "south" | "west";
    label: string;
    address1: string;
    city: string;
    state: string;
    postal_code: string;
    is_primary: boolean;
};

export const SEED_SITES: readonly SeedSite[] = [
    { n: 1, key: "north", label: "North Campus", address1: "100 Example Avenue", city: "Salem", state: "OR", postal_code: "97301", is_primary: true },
    { n: 2, key: "south", label: "South Campus", address1: "200 Example Avenue", city: "Salem", state: "OR", postal_code: "97302", is_primary: false },
    { n: 3, key: "west", label: "West Campus", address1: "300 Example Avenue", city: "Salem", state: "OR", postal_code: "97304", is_primary: false },
];

export type AgeGroup = "infant" | "toddler" | "preschool" | "pre_k" | "school_age" | "kindergarten";

export type SeedRoom = {
    /** 0x100 + ordinal, so rooms never share an id with a site (both are `locations`). */
    n: number;
    site: SeedSite["key"];
    label: string;
    capacity: number;
    /** Staff:child ratio as Firefly records it — tiers separated by commas. */
    ratio: string;
    age_group: AgeGroup;
};

const ROOMS: Array<Omit<SeedRoom, "n">> = [
    { site: "north", label: "Infant A", capacity: 8, ratio: "1:5,2:11", age_group: "infant" },
    { site: "north", label: "Infant B", capacity: 8, ratio: "1:5", age_group: "infant" },
    { site: "north", label: "Toddler 1", capacity: 10, ratio: "1:6", age_group: "toddler" },
    { site: "north", label: "Toddler 2", capacity: 10, ratio: "1:7", age_group: "toddler" },
    { site: "north", label: "Preschool 1", capacity: 12, ratio: "1:7,2:15", age_group: "preschool" },
    { site: "north", label: "Preschool 2", capacity: 12, ratio: "1:7,2:15", age_group: "preschool" },
    { site: "north", label: "Pre-K", capacity: 15, ratio: "1:8", age_group: "pre_k" },
    { site: "south", label: "Monkeys", capacity: 9, ratio: "1:5", age_group: "infant" },
    { site: "south", label: "Zebras", capacity: 9, ratio: "1:5", age_group: "infant" },
    { site: "south", label: "Bears", capacity: 10, ratio: "1:6", age_group: "toddler" },
    { site: "south", label: "Tigers", capacity: 10, ratio: "1:6", age_group: "toddler" },
    { site: "south", label: "Giraffe", capacity: 12, ratio: "1:6,2:14", age_group: "preschool" },
    { site: "west", label: "Infant A", capacity: 6, ratio: "1:4", age_group: "infant" },
    { site: "west", label: "Infant B", capacity: 6, ratio: "1:4", age_group: "infant" },
    { site: "west", label: "Toddler 1", capacity: 7, ratio: "1:6", age_group: "toddler" },
    { site: "west", label: "Toddler 2", capacity: 7, ratio: "1:6", age_group: "toddler" },
    { site: "west", label: "Preschool", capacity: 8, ratio: "1:8", age_group: "preschool" },
];

export const SEED_ROOMS: readonly SeedRoom[] = ROOMS.map((room, i) => ({ ...room, n: 0x100 + i + 1 }));

export type SeedProgramCategory = { n: number; site: SeedSite["key"]; key: AgeGroup; label: string };

const PROGRAM_LABELS: Record<AgeGroup, string> = {
    infant: "Infant",
    toddler: "Toddler",
    preschool: "Preschool",
    pre_k: "Pre-K",
    school_age: "School Age",
    kindergarten: "Kindergarten",
};

export const SEED_PROGRAM_CATEGORIES: readonly SeedProgramCategory[] = (() => {
    const rows: SeedProgramCategory[] = [];
    for (const site of SEED_SITES) {
        const keys: AgeGroup[] = ["infant", "toddler", "preschool", "pre_k", "school_age"];
        if (site.key === "north") keys.push("kindergarten");
        for (const key of keys) rows.push({ n: rows.length + 1, site: site.key, key, label: PROGRAM_LABELS[key] });
    }
    return rows;
})();

export type AttendanceType = "full_time" | "part_time" | "before_school" | "custom";

export type SeedOffering = {
    n: number;
    program_key: AgeGroup;
    label: string;
    attendance_type: AttendanceType;
    /** days per week → monthly private-pay rate in cents (org default, no site override). */
    monthly_rate_cents_by_days: Readonly<Record<number, number>>;
};

const usd = (dollars: number) => Math.round(dollars * 100);

/**
 * Rates: infant, toddler and preschool are Firefly's census values for 1–5 days. The live tenant
 * splits each program into a full-week and part-week offering that sell the same rate card, so the
 * full-time offering sells 4–5 days and the part-time one 1–3. School-age offerings carry the census
 * endpoints (1 and 5 days); the three days between are interpolated and marked so in the README.
 */
export const SEED_OFFERINGS: readonly SeedOffering[] = [
    { n: 1, program_key: "infant", label: "Infant", attendance_type: "full_time", monthly_rate_cents_by_days: { 4: usd(1650), 5: usd(1850) } },
    { n: 2, program_key: "infant", label: "Infant Part Time", attendance_type: "part_time", monthly_rate_cents_by_days: { 1: usd(525), 2: usd(950), 3: usd(1325) } },
    { n: 3, program_key: "toddler", label: "Toddler Full Day", attendance_type: "full_time", monthly_rate_cents_by_days: { 4: usd(1500), 5: usd(1700) } },
    { n: 4, program_key: "toddler", label: "Toddler Part Time", attendance_type: "part_time", monthly_rate_cents_by_days: { 1: usd(475), 2: usd(875), 3: usd(1200) } },
    { n: 5, program_key: "preschool", label: "Preschool", attendance_type: "full_time", monthly_rate_cents_by_days: { 3: usd(1075), 4: usd(1350), 5: usd(1550) } },
    { n: 6, program_key: "school_age", label: "Before School", attendance_type: "before_school", monthly_rate_cents_by_days: { 1: usd(125), 2: usd(200), 3: usd(275), 4: usd(350), 5: usd(450) } },
    { n: 7, program_key: "school_age", label: "After School", attendance_type: "full_time", monthly_rate_cents_by_days: { 1: usd(175), 2: usd(300), 3: usd(400), 4: usd(525), 5: usd(650) } },
    { n: 8, program_key: "school_age", label: "Before & After", attendance_type: "custom", monthly_rate_cents_by_days: { 1: usd(250), 2: usd(425), 3: usd(575), 4: usd(750), 5: usd(900) } },
];

export type SeedVariant = { n: number; offering: number; days: number; label: string; rate_cents: number };

export const SEED_VARIANTS: readonly SeedVariant[] = (() => {
    const rows: SeedVariant[] = [];
    for (const offering of SEED_OFFERINGS) {
        for (const [days, cents] of Object.entries(offering.monthly_rate_cents_by_days)) {
            const d = Number(days);
            rows.push({ n: rows.length + 1, offering: offering.n, days: d, label: `${d} day${d === 1 ? "" : "s"} a week`, rate_cents: cents });
        }
    }
    return rows;
})();

export type SeedChargeTemplate = {
    n: number;
    template_key: string;
    label: string;
    charge_category: string;
    trigger_type: string;
    amount_strategy: "fixed" | "rate_derived";
    amount_cents: number | null;
    occurs_on_strategy: string;
};

export const SEED_CHARGE_TEMPLATES: readonly SeedChargeTemplate[] = [
    { n: 1, template_key: "registration_fee", label: "Registration Fee", charge_category: "fee", trigger_type: "manual", amount_strategy: "fixed", amount_cents: usd(75), occurs_on_strategy: "now" },
    { n: 2, template_key: "tuition", label: "Tuition", charge_category: "tuition", trigger_type: "schedule", amount_strategy: "rate_derived", amount_cents: null, occurs_on_strategy: "service_period_start" },
];

/** customer_persons.role_type vocabulary (same keys the childcare control-plane migration authors). */
export const SEED_ROLE_TYPES = [
    { n: 1, key: "child", label: "Child", description: "Child linked to the family (household) account.", sort_order: 15 },
    { n: 2, key: "parent", label: "Parent", description: "Parent linked to the family account.", sort_order: 20 },
    { n: 3, key: "guardian", label: "Guardian", description: "Legal guardian for the child.", sort_order: 25 },
    { n: 4, key: "emergency_contact", label: "Emergency contact", description: "Emergency contact for pickup or incidents.", sort_order: 30 },
    { n: 5, key: "authorized_pickup", label: "Authorized pickup", description: "Adult authorized to pick up the child.", sort_order: 35 },
    { n: 6, key: "payer", label: "Payer", description: "Person responsible for tuition / billing.", sort_order: 40 },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Households
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where a family case sits. `stage` is the Enrollment template stage key; child-track stages
 * (waitlist, enrolling, enrolled, closed_withdrawn) also land on each child's participation row.
 */
export type FamilyScenario = {
    stage: "lead" | "tour" | "decision" | "closed" | "waitlist" | "enrolling" | "enrolled" | "closed_withdrawn";
    count: number;
    /** Opportunity status: closed cases are `closed` with a reason; everything else is `open`. */
    status: "open" | "closed";
    close_reason_key?: string;
    /** Days before the anchor the inquiry arrived. Spread across the count. */
    inquired_days_ago: [number, number];
    tour?: "upcoming" | "past";
    child_outcome_status_key?: "waitlisted" | "enrolling" | "enrolled" | "withdrawn" | "not_enrolling";
};

/**
 * The shape of a single-school enrollment funnel: most families are early, a few are mid-journey,
 * and a working school carries enrolled families and closed history. 60 households in all.
 */
export const SEED_FAMILY_SCENARIOS: readonly FamilyScenario[] = [
    { stage: "lead", count: 14, status: "open", inquired_days_ago: [0, 13] },
    { stage: "tour", count: 8, status: "open", inquired_days_ago: [7, 20], tour: "upcoming" },
    { stage: "decision", count: 5, status: "open", inquired_days_ago: [14, 30], tour: "past" },
    { stage: "waitlist", count: 7, status: "open", inquired_days_ago: [30, 120], tour: "past", child_outcome_status_key: "waitlisted" },
    { stage: "enrolling", count: 5, status: "open", inquired_days_ago: [21, 45], tour: "past", child_outcome_status_key: "enrolling" },
    { stage: "enrolled", count: 12, status: "open", inquired_days_ago: [60, 300], tour: "past", child_outcome_status_key: "enrolled" },
    { stage: "closed", count: 6, status: "closed", close_reason_key: "lost", inquired_days_ago: [20, 90], child_outcome_status_key: "not_enrolling" },
    { stage: "closed_withdrawn", count: 3, status: "closed", close_reason_key: "withdrawn", inquired_days_ago: [90, 200], tour: "past", child_outcome_status_key: "withdrawn" },
];

const SURNAMES = [
    "Alder", "Aspen", "Birch", "Cedar", "Cypress", "Dogwood", "Elm", "Fir", "Hawthorn", "Hazel",
    "Hemlock", "Holly", "Juniper", "Larch", "Laurel", "Linden", "Locust", "Magnolia", "Maple", "Myrtle",
    "Oak", "Olive", "Palmer", "Pine", "Poplar", "Redwood", "Rowan", "Sequoia", "Spruce", "Sumac",
    "Sycamore", "Tamarack", "Walnut", "Willow", "Yew", "Acacia", "Banyan", "Catalpa", "Chestnut", "Ginkgo",
    "Hickory", "Ironwood", "Kauri", "Mahogany", "Mesquite", "Mulberry", "Pecan", "Persimmon", "Plum", "Quince",
    "Sassafras", "Teak", "Tupelo", "Wisteria", "Basswood", "Boxwood", "Buckeye", "Cottonwood", "Elder", "Sorrel",
] as const;

const GUARDIAN_FIRST = ["Jordan", "Morgan", "Taylor", "Casey", "Riley", "Avery", "Quinn", "Parker", "Reese", "Skyler", "Drew", "Emerson"] as const;
const SECOND_GUARDIAN_FIRST = ["Alex", "Sam", "Jamie", "Robin", "Dana", "Kendall", "Logan", "Hayden"] as const;
const CHILD_FIRST = ["Ada", "Theo", "Mila", "Leo", "Nora", "Owen", "Ivy", "Felix", "Ruby", "Milo", "June", "Arlo", "Wren", "Jude", "Hazel", "Silas"] as const;
const INQUIRY_SOURCES = ["website", "phone", "walk_in", "referral", "website", "website"] as const;

/** Age in months at the anchor, per program — so a child's program matches their date of birth. */
const AGE_MONTHS: Record<AgeGroup, [number, number]> = {
    infant: [3, 14],
    toddler: [15, 34],
    preschool: [36, 47],
    pre_k: [48, 59],
    kindergarten: [60, 71],
    school_age: [72, 119],
};
const PROGRAM_ROTATION: AgeGroup[] = ["infant", "toddler", "preschool", "toddler", "pre_k", "infant", "preschool", "school_age"];

export type SeedGuardian = { n: number; first_name: string; last_name: string; email: string; phone: string; role_type: "parent" | "guardian"; is_primary: boolean };
export type SeedChild = {
    n: number;
    first_name: string;
    last_name: string;
    dob: string;
    program: AgeGroup;
    site: SeedSite["key"];
    schedule_type: "full_time" | "part_time";
    days_per_week: number;
    desired_start_date: string;
};
export type SeedFamily = {
    n: number;
    surname: string;
    stage: FamilyScenario["stage"];
    status: FamilyScenario["status"];
    close_reason_key: string | null;
    source: string;
    site: SeedSite["key"];
    work_unit_id: string;
    inquired_at: string;
    last_activity_at: string;
    tour_date: string | null;
    child_outcome_status_key: string | null;
    guardians: SeedGuardian[];
    children: SeedChild[];
};

/** Shown in every seeded household, case and child name. */
export const SEED_DISPLAY_MARKER = "[Staging seed]";

export function seedHouseholdName(f: Pick<SeedFamily, "surname">): string {
    return `${f.surname} Family ${SEED_DISPLAY_MARKER}`;
}

export function seedCaseTitle(f: Pick<SeedFamily, "surname" | "children">): string {
    return `${SEED_DISPLAY_MARKER} ${f.surname} Family — ${f.children.map((c) => c.first_name).join(" & ")}`;
}

export function seedChildDisplayName(c: Pick<SeedChild, "first_name" | "last_name">): string {
    return `${c.first_name} ${c.last_name} ${SEED_DISPLAY_MARKER}`;
}

export function addDays(isoDate: string, days: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function addMonths(isoDate: string, months: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
}

/** NANP fictional block: 555-0100 … 555-0199. Two area codes give 200 distinct numbers. */
function fictionalPhone(n: number): string {
    if (n < 1 || n > 200) throw new Error(`fictionalPhone: only 200 numbers are fictional, asked for #${n}`);
    const area = n <= 100 ? "503" : "971";
    return `+1${area}55501${String((n - 1) % 100).padStart(2, "0")}`;
}

function workUnitForStage(stage: FamilyScenario["stage"]): string {
    if (stage === "lead" || stage === "closed") return SEED_WORK_UNIT_IDS.new_leads;
    if (stage === "tour") return SEED_WORK_UNIT_IDS.tours;
    return SEED_WORK_UNIT_IDS.enrollment_pipeline;
}

const PROGRAMS_BY_SITE: Record<SeedSite["key"], Set<AgeGroup>> = (() => {
    const out = { north: new Set<AgeGroup>(), south: new Set<AgeGroup>(), west: new Set<AgeGroup>() };
    for (const c of SEED_PROGRAM_CATEGORIES) out[c.site].add(c.key);
    return out;
})();

export function buildSeedFamilies(): SeedFamily[] {
    const families: SeedFamily[] = [];
    let guardianN = 0;
    let childN = 0;
    for (const scenario of SEED_FAMILY_SCENARIOS) {
        for (let i = 0; i < scenario.count; i++) {
            const n = families.length + 1;
            const surname = SURNAMES[n - 1];
            const site = SEED_SITES[(n - 1) % SEED_SITES.length].key;
            const [lo, hi] = scenario.inquired_days_ago;
            const daysAgo = scenario.count === 1 ? lo : lo + Math.round(((hi - lo) * i) / (scenario.count - 1));
            const inquired = addDays(SEED_ANCHOR_DATE, -daysAgo);
            const tour_date =
                scenario.tour === "upcoming"
                    ? addDays(SEED_ANCHOR_DATE, 1 + (i % 7))
                    : scenario.tour === "past"
                      ? addDays(inquired, 5 + (n % 5))
                      : null;
            // Recent touch: half a stage's age, never after the anchor.
            const last = addDays(SEED_ANCHOR_DATE, -Math.floor(daysAgo / 2));

            const guardians: SeedGuardian[] = [];
            const guardianCount = n % 3 === 0 ? 1 : 2; // a third of households are single-guardian
            for (let g = 0; g < guardianCount; g++) {
                guardianN += 1;
                const first = g === 0 ? GUARDIAN_FIRST[(n - 1) % GUARDIAN_FIRST.length] : SECOND_GUARDIAN_FIRST[(n - 1) % SECOND_GUARDIAN_FIRST.length];
                guardians.push({
                    n: guardianN,
                    first_name: first,
                    last_name: surname,
                    email: `${first.toLowerCase()}.${surname.toLowerCase()}@firefly-staging.invalid`,
                    phone: fictionalPhone(guardianN),
                    role_type: n % 11 === 0 && g === 1 ? "guardian" : "parent",
                    is_primary: g === 0,
                });
            }

            const children: SeedChild[] = [];
            const childCount = n % 4 === 0 ? 2 : 1; // a quarter of households bring siblings
            for (let c = 0; c < childCount; c++) {
                childN += 1;
                let program = PROGRAM_ROTATION[(n + c * 3) % PROGRAM_ROTATION.length];
                if (!PROGRAMS_BY_SITE[site].has(program)) program = "preschool";
                const [minM, maxM] = AGE_MONTHS[program];
                const ageMonths = minM + ((n * 7 + c * 5) % (maxM - minM + 1));
                const dob = addDays(addMonths(SEED_ANCHOR_DATE, -ageMonths), -((n + c) % 27));
                const fullTime = (n + c) % 3 !== 0;
                const days = fullTime ? 5 : 3;
                children.push({
                    n: childN,
                    first_name: CHILD_FIRST[(childN - 1) % CHILD_FIRST.length],
                    last_name: surname,
                    dob,
                    program,
                    site,
                    schedule_type: fullTime ? "full_time" : "part_time",
                    days_per_week: days,
                    desired_start_date:
                        scenario.stage === "enrolled" || scenario.stage === "closed_withdrawn"
                            ? addDays(inquired, 30)
                            : addDays(SEED_ANCHOR_DATE, 14 + ((n * 9) % 90)),
                });
            }

            families.push({
                n,
                surname,
                stage: scenario.stage,
                status: scenario.status,
                close_reason_key: scenario.close_reason_key ?? null,
                source: INQUIRY_SOURCES[(n - 1) % INQUIRY_SOURCES.length],
                site,
                work_unit_id: workUnitForStage(scenario.stage),
                inquired_at: `${inquired}T16:${String((n * 7) % 60).padStart(2, "0")}:00Z`,
                last_activity_at: `${last}T18:${String((n * 11) % 60).padStart(2, "0")}:00Z`,
                tour_date,
                child_outcome_status_key: scenario.child_outcome_status_key ?? null,
                guardians,
                children,
            });
        }
    }
    return families;
}

/** Counts the verification census expects. Derived, never typed by hand. */
export function expectedSeedCounts() {
    const families = buildSeedFamilies();
    const guardians = families.flatMap((f) => f.guardians);
    const children = families.flatMap((f) => f.children);
    const byStage: Record<string, number> = {};
    for (const f of families) byStage[f.stage] = (byStage[f.stage] ?? 0) + 1;
    return {
        locations: SEED_SITES.length + SEED_ROOMS.length,
        sites: SEED_SITES.length,
        rooms: SEED_ROOMS.length,
        program_categories: SEED_PROGRAM_CATEGORIES.length,
        offerings: SEED_OFFERINGS.length,
        variants: SEED_VARIANTS.length,
        tuition_rates: SEED_VARIANTS.length,
        charge_templates: SEED_CHARGE_TEMPLATES.length,
        role_types: SEED_ROLE_TYPES.length,
        work_units: Object.keys(SEED_WORK_UNIT_IDS).length,
        customers: families.length,
        persons: guardians.length,
        customer_persons: guardians.length,
        children: children.length,
        child_relationships: children.length,
        opportunities: families.length,
        opportunity_persons: guardians.length,
        opportunity_children: children.length,
        opportunities_by_stage: byStage,
    };
}

/** Stable ids a reader (or test) can name. */
export const seedIds = {
    site: (n: number) => seedId("location", n),
    room: (n: number) => seedId("location", n),
    programCategory: (n: number) => seedId("program_category", n),
    offering: (n: number) => seedId("program_offering", n),
    variant: (n: number) => seedId("offering_variant", n),
    tuitionRate: (n: number) => seedId("tuition_rate", n),
    chargeTemplate: (n: number) => seedId("charge_template", n),
    roleType: (n: number) => seedId("role_type", n),
    customer: (n: number) => seedId("customer", n),
    person: (n: number) => seedId("person", n),
    child: (n: number) => seedId("child", n),
    opportunity: (n: number) => seedId("opportunity", n),
    customerPerson: (n: number) => seedId("customer_person", n),
    opportunityPerson: (n: number) => seedId("opportunity_person", n),
    opportunityChild: (n: number) => seedId("opportunity_child", n),
    childRelationship: (n: number) => seedId("child_relationship", n),
};
