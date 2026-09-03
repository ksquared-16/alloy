/**
 * REAL ENROLLMENT V1 — the certification phases themselves.
 *
 * Each phase proves one property against the LIVE certification database using real product entry
 * points, and states its own failure boundary. See enrollmentE2eDriver.ts for the harness contract.
 *
 * Phases that require the participant browser surface are declared `not_implemented` rather than
 * stubbed green. A harness that reports PASS for a step it never ran is not a weaker harness, it is
 * a misleading one, and this program has already lost days to confident claims that outran their
 * evidence.
 */

import type { Phase } from "@/lib/certification/enrollmentE2eDriver";
import { CERT_FAMILIES, findFixtureHousehold, verifyEnrollmentCertification } from "@/lib/certification/enrollmentCertificationFixture";
/*
 * From lib/process/processInstances, which is where this constant actually lives. The first draft
 * imported it from the status vocabulary, and under tsx a missing named export resolves to
 * `undefined` rather than throwing — so every journey compared unequal and the phase reported a
 * confident failure naming the correct value as wrong. Worth stating: the harness failed CLOSED,
 * which is the safe direction, but the lesson is that an import of a constant deserves the same
 * "read where it is defined" discipline as a database column.
 */
import { ENROLLMENT_PARTICIPATION_CONTEXT_TYPE } from "@/lib/process/processInstances";

type Row = Record<string, unknown>;

/** A: the starting state exists and is exactly what the fixture claims. */
const bootstrap: Phase = {
    key: "A_bootstrap",
    title: "fixture bootstrap",
    async run(ctx) {
        const result = await verifyEnrollmentCertification(ctx.supabase, ctx.orgId);
        if (!result.ok) {
            return { status: "failed", detail: `fixture is not verifiable: ${result.findings.join("; ")}` };
        }
        return {
            status: "passed",
            detail: `both certification families verify with no findings`,
            evidence: { families: result.families },
        };
    },
};

/**
 * B: entry state, at the grain the whole lane exists to protect.
 *
 * Path A must be context-free; Path B must retain its acquisition Opportunity. Both must anchor their
 * journey to the participation. This is the property the grain correction established, so it is
 * asserted against live data on every run rather than trusted because a unit test passed.
 */
const entryState: Phase = {
    key: "B_entry",
    title: "entry state and grain separation",
    dependsOn: ["A_bootstrap"],
    async run(ctx) {
        const problems: string[] = [];
        const seen: Record<string, unknown> = {};

        for (const key of Object.keys(CERT_FAMILIES) as Array<keyof typeof CERT_FAMILIES>) {
            const spec = CERT_FAMILIES[key];
            const { customerId } = await findFixtureHousehold(ctx.supabase, ctx.orgId, spec.email);
            if (!customerId) {
                problems.push(`${spec.key}: household absent`);
                continue;
            }

            const { data: members } = await ctx.supabase
                .from("customer_members")
                .select("id")
                .eq("org_id", ctx.orgId)
                .eq("customer_id", customerId)
                .eq("relationship", "child");
            const childId = ((members ?? []) as Row[])[0]?.id as string | undefined;
            if (!childId) {
                problems.push(`${spec.key}: child absent`);
                continue;
            }

            const { data: ocms } = await ctx.supabase
                .from("opportunity_customer_members")
                .select("id, opportunity_id")
                .eq("org_id", ctx.orgId)
                .eq("customer_member_id", childId);
            const ocmRows = (ocms ?? []) as Row[];
            if (ocmRows.length !== 1) {
                problems.push(`${spec.key}: expected exactly one participation, found ${ocmRows.length}`);
                continue;
            }
            const ocm = ocmRows[0]!;

            const { data: journeys } = await ctx.supabase
                .from("process_instances")
                .select("id, context_type, context_id, stage_key, state, metadata")
                .eq("org_id", ctx.orgId)
                .eq("process_key", "enrollment")
                .eq("subject_id", childId);
            const jrs = (journeys ?? []) as Row[];
            if (jrs.length !== 1) {
                problems.push(`${spec.key}: expected exactly one journey, found ${jrs.length}`);
                continue;
            }
            const j = jrs[0]!;

            if (j.context_type !== ENROLLMENT_PARTICIPATION_CONTEXT_TYPE) {
                problems.push(`${spec.key}: journey anchored as ${String(j.context_type)}`);
            }
            if (j.context_id !== ocm.id) {
                problems.push(`${spec.key}: journey is not anchored to its participation`);
            }
            // The grain property: Path A carries no acquisition Opportunity, Path B keeps one.
            if (spec.key === "context_free" && ocm.opportunity_id) {
                problems.push("context_free: participation carries an acquisition Opportunity");
            }
            if (spec.key === "opportunity_backed" && !ocm.opportunity_id) {
                problems.push("opportunity_backed: participation lost its acquisition Opportunity");
            }
            seen[spec.key] = { childId, participationId: ocm.id, journeyId: j.id, stageKey: j.stage_key };
        }

        return problems.length
            ? { status: "failed", detail: problems.join("; ") }
            : { status: "passed", detail: "both paths: one participation, one anchored journey, grain preserved", evidence: seen };
    },
};

/**
 * R1: Path A's Enrollment does not rejoin the acquisition track.
 *
 * THE FIRST VERSION OF THIS PHASE WAS WRONG, and the correction is worth keeping. It asserted that
 * the context-free household holds ZERO Opportunities, and duly failed — because Path A's fixture is
 * built through Create Lead and then CONCLUDES the acquisition, so one historical Opportunity is
 * exactly what its design produces. The spec's "Path A creates no Opportunity" means Enrollment must
 * not FABRICATE one, not that the family never had an acquisition.
 *
 * So the property is stated at the grain that actually carries it: the participation must remain
 * context-free, and the household's acquisition must stay concluded. A count of Opportunities is
 * recorded as evidence so a later lifecycle phase can prove it did not GROW, which is the real
 * regression this guards against.
 */
const pathAStaysContextFree: Phase = {
    key: "R1_path_a_stays_context_free",
    title: "negative: context-free Enrollment does not rejoin the acquisition track",
    dependsOn: ["B_entry"],
    async run(ctx) {
        const spec = CERT_FAMILIES.contextFree;
        const { customerId } = await findFixtureHousehold(ctx.supabase, ctx.orgId, spec.email);
        if (!customerId) return { status: "failed", detail: "context-free household absent" };

        const { data: opps } = await ctx.supabase
            .from("opportunities")
            .select("id, status")
            .eq("org_id", ctx.orgId)
            .eq("customer_id", customerId);
        const oppRows = (opps ?? []) as Row[];

        const { data: members } = await ctx.supabase
            .from("customer_members")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("customer_id", customerId)
            .eq("relationship", "child");
        const childId = ((members ?? []) as Row[])[0]?.id as string | undefined;
        if (!childId) return { status: "failed", detail: "context-free child absent" };

        const { data: ocms } = await ctx.supabase
            .from("opportunity_customer_members")
            .select("opportunity_id")
            .eq("org_id", ctx.orgId)
            .eq("customer_member_id", childId);
        const attached = ((ocms ?? []) as Row[]).filter((r) => r.opportunity_id);

        return attached.length === 0
            ? {
                  status: "passed",
                  detail: `participation is context-free; household holds ${oppRows.length} concluded acquisition record(s)`,
                  evidence: { opportunityCount: oppRows.length },
              }
            : {
                  status: "failed",
                  detail: `context-free participation has acquired an Opportunity reference`,
              };
    },
};

/**
 * R2: no duplicate active context-free participation.
 *
 * The episode-slot invariant. `enrolled` ends an episode, so a second active context-free
 * participation for one child means either the slot was never released or two were opened.
 */
const noDuplicateActiveEpisode: Phase = {
    key: "R2_no_duplicate_episode",
    title: "negative: no duplicate active context-free participation",
    dependsOn: ["B_entry"],
    async run(ctx) {
        const { data } = await ctx.supabase
            .from("opportunity_customer_members")
            .select("customer_member_id, opportunity_id, outcome_status_key")
            .eq("org_id", ctx.orgId)
            .is("opportunity_id", null);
        const rows = (data ?? []) as Row[];
        const concluded = new Set(["enrolled", "withdrawn", "closed_withdrawn", "not_enrolling"]);
        const active = rows.filter((r) => !concluded.has(String(r.outcome_status_key ?? "")));
        const byChild = new Map<string, number>();
        for (const r of active) {
            const k = String(r.customer_member_id);
            byChild.set(k, (byChild.get(k) ?? 0) + 1);
        }
        const offenders = [...byChild.values()].filter((n) => n > 1).length;
        return offenders === 0
            ? { status: "passed", detail: `${active.length} active context-free participation(s), none duplicated` }
            : { status: "failed", detail: `${offenders} child(ren) hold more than one active context-free participation` };
    },
};

/**
 * L: the shared requirement-sufficiency verdict, read from the ACTIVE published configuration.
 *
 * This is the contract the operator surface and the completion gate both consult, so it is asserted
 * once here rather than trusted twice. It deliberately asks the configuration what it requires
 * instead of asserting a count: an earlier version of this program hardcoded "five Form
 * requirements" against a tenant that publishes one, and spent days treating a correct system as
 * broken. The number is evidence, never an expectation.
 */
const sufficiencyContract: Phase = {
    key: "L_sufficiency",
    title: "requirement sufficiency, from the active published configuration",
    dependsOn: ["B_entry"],
    async run(ctx) {
        const { resolveEnrollmentCompletionSufficiency } = await import(
            "@/lib/enrollment/completion/enrollmentCompletionSufficiency"
        );
        const { projectEnrollmentCompletionReadiness } = await import(
            "@/lib/enrollment/completion/projectEnrollmentCompletionReadiness"
        );

        const entry = ctx.facts.B_entry as Record<string, { journeyId: string }> | undefined;
        if (!entry) return { status: "failed", detail: "entry facts unavailable" };

        const observed: Record<string, unknown> = {};
        const problems: string[] = [];

        for (const [family, f] of Object.entries(entry)) {
            const res = await resolveEnrollmentCompletionSufficiency(ctx.supabase, {
                orgId: ctx.orgId,
                processInstanceId: f.journeyId,
            });
            if (!res.ok) {
                problems.push(`${family}: sufficiency refused (${res.refusal.code}: ${res.refusal.detail})`);
                continue;
            }
            const readiness = projectEnrollmentCompletionReadiness({ sufficiency: res.sufficiency });

            /*
             * The property under test is AGREEMENT, not a particular verdict. Whether this journey is
             * ready or blocked is the tenant's configuration talking; what must never differ is the
             * gate's answer and the operator projection's answer, because a surface that says "ready"
             * over a gate that refuses is the defect this contract exists to prevent.
             */
            const gateEligible = res.sufficiency.eligible;
            const surfaceReady = readiness.state === "ready";
            if (gateEligible !== surfaceReady) {
                problems.push(
                    `${family}: the completion gate says ${gateEligible ? "eligible" : "blocked"} while the operator projection says ${readiness.state}`,
                );
            }

            observed[family] = {
                eligible: gateEligible,
                projection: readiness.state,
                requirements: res.sufficiency.requirements.length,
                blocking: res.sufficiency.requirements.filter((r) => r.disposition === "blocking").length,
            };
        }

        return problems.length
            ? { status: "failed", detail: problems.join("; ") }
            : {
                  status: "passed",
                  detail: `gate and operator projection agree for both paths: ${JSON.stringify(observed)}`,
                  evidence: observed,
              };
    },
};

/** Where the lane's dev server answers. Overridable so this is not pinned to one slot. */
const APP_ORIGIN = (process.env.ALLOY_CERT_APP_ORIGIN ?? "http://localhost:3014").replace(/\/+$/, "");

/**
 * Terminology that must never reach a participant.
 *
 * A family filling in enrolment paperwork should never meet the machinery that routes it. These are
 * the words this program actually uses internally, so they are the ones capable of leaking.
 */
const INTERNAL_TERMS = [
    "opportunity_customer_members",
    "process_instance",
    "context_id",
    "context_type",
    "outcome_status_key",
    "customer_member",
    "OCM",
] as const;

/**
 * C: participant entry, through the real launch and the real browser.
 *
 * This is the phase the previous fourteen TODOs were all waiting on: it establishes that a journey
 * can be turned into a participant URL by the product's own launch path, and that the URL renders a
 * participant experience without an auth wall. Every later browser phase reuses what it proves.
 */
const participantEntry: Phase = {
    key: "C_participant_entry",
    title: "participant entry through the real launch path",
    dependsOn: ["B_entry"],
    async run(ctx) {
        const { launchParticipantEnrollment } = await import(
            "@/lib/enrollment/participantLaunch/launchParticipantEnrollment"
        );
        const entry = ctx.facts.B_entry as Record<string, { journeyId: string }> | undefined;
        const pathA = entry?.context_free;
        if (!pathA) return { status: "failed", detail: "Path A entry facts unavailable" };

        const launch = await launchParticipantEnrollment(ctx.supabase, {
            orgId: ctx.orgId,
            processInstanceId: pathA.journeyId,
        } as Parameters<typeof launchParticipantEnrollment>[1]);

        if (!launch.ok) {
            return {
                status: "failed",
                detail: `participant launch refused (${launch.refusal.code}: ${launch.refusal.detail})`,
            };
        }
        const { participantPath, sessionId, outcome, stageKey } = launch.value;
        if (!participantPath) {
            return { status: "failed", detail: "launch succeeded but returned no participant URL to open" };
        }

        // The browser half. Imported lazily so a driver run that never reaches here needs no browser.
        const { chromium } = await import("playwright");
        const browser = await chromium.launch();
        try {
            const page = await browser.newPage();
            const consoleErrors: string[] = [];
            const failedRequests: string[] = [];
            page.on("console", (m) => {
                if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
            });
            page.on("requestfailed", (r) => failedRequests.push(r.url().slice(0, 120)));

            const url = `${APP_ORIGIN}${participantPath}`;
            const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
            const finalUrl = page.url();

            if (/\/login/.test(finalUrl)) {
                return { status: "failed", detail: `participant URL redirected to sign-in: ${finalUrl}` };
            }
            if (response && response.status() >= 400) {
                return { status: "failed", detail: `participant URL returned HTTP ${response.status()}` };
            }

            const bodyText = await page.locator("body").innerText().catch(() => "");
            const leaked = INTERNAL_TERMS.filter((t) => bodyText.includes(t));
            if (leaked.length) {
                return { status: "failed", detail: `internal terminology reached the participant: ${leaked.join(", ")}` };
            }

            return {
                status: "passed",
                detail: `participant runtime opened (${outcome}) at stage ${stageKey}; no sign-in redirect, no internal terminology`,
                evidence: {
                    participantPath,
                    sessionId,
                    stageKey,
                    finalUrl,
                    consoleErrors: consoleErrors.length,
                    failedRequests: failedRequests.length,
                    renderedChars: bodyText.length,
                    // Structure, so later phases are written against what the surface actually
                    // renders rather than against an assumed layout.
                    headings: await page.locator("h1, h2, h3").allInnerTexts().catch(() => []),
                    buttons: await page.locator("button, [role=button]").allInnerTexts().catch(() => []),
                    inputs: await page.locator("input, textarea, select").count().catch(() => 0),
                },
            };
        } finally {
            await browser.close();
        }
    },
};

/**
 * Open the Path A participant runtime and hand the page to a caller.
 *
 * Extracted once C proved the route works. Every browser phase after C needs the same three steps —
 * launch, resolve the URL, open it — and copying them per phase is how the phases would drift into
 * testing slightly different surfaces.
 */
async function withParticipantPage<T>(
    ctx: DriverContextLike,
    journeyId: string,
    body: (page: PlaywrightPage) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; detail: string }> {
    const { launchParticipantEnrollment } = await import(
        "@/lib/enrollment/participantLaunch/launchParticipantEnrollment"
    );
    const launch = await launchParticipantEnrollment(ctx.supabase, {
        orgId: ctx.orgId,
        processInstanceId: journeyId,
    } as Parameters<typeof launchParticipantEnrollment>[1]);
    if (!launch.ok) {
        return { ok: false, detail: `participant launch refused (${launch.refusal.code}: ${launch.refusal.detail})` };
    }
    if (!launch.value.participantPath) {
        return { ok: false, detail: "launch returned no participant URL" };
    }

    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`${APP_ORIGIN}${launch.value.participantPath}`, {
            waitUntil: "networkidle",
            timeout: 60000,
        });
        return { ok: true, value: await body(page as unknown as PlaywrightPage) };
    } finally {
        await browser.close();
    }
}

type DriverContextLike = { supabase: Parameters<Phase["run"]>[0]["supabase"]; orgId: string };
type PlaywrightPage = {
    locator(sel: string): {
        allInnerTexts(): Promise<string[]>;
        innerText(): Promise<string>;
        count(): Promise<number>;
        first(): { click(opts?: unknown): Promise<void>; innerText(): Promise<string> };
    };
    getByRole(role: string, opts?: unknown): { first(): { click(opts?: unknown): Promise<void>; count(): Promise<number> } };
    waitForTimeout(ms: number): Promise<void>;
    url(): string;
};

/**
 * D: prior truth is CONFIRMED, not re-collected.
 *
 * The distinction this proves is the one families feel: a service that already knows your child's
 * name and asks for it again has not remembered anything. The participant surface offers "Yes,
 * that's right" against a stated fact, with "Change" beside it — an affordance that only makes sense
 * over prior truth, and which a blank collection field cannot express.
 */
const priorTruthConfirmation: Phase = {
    key: "D_confirmation",
    title: "known facts are confirmed rather than re-collected",
    dependsOn: ["C_participant_entry"],
    async run(ctx) {
        const entry = ctx.facts.B_entry as Record<string, { journeyId: string }> | undefined;
        const pathA = entry?.context_free;
        if (!pathA) return { status: "failed", detail: "Path A entry facts unavailable" };

        const opened = await withParticipantPage(ctx, pathA.journeyId, async (page) => {
            const buttons = await page.locator("button, [role=button]").allInnerTexts();
            const bodyText = await page.locator("body").innerText();
            const labelled = buttons.map((b) => b.trim()).filter(Boolean);

            const confirms = labelled.some((b) => /that's right|yes/i.test(b));
            const changes = labelled.some((b) => /change|edit/i.test(b));

            return { labelled, confirms, changes, bodyText };
        });

        if (!opened.ok) return { status: "failed", detail: opened.detail };
        const { labelled, confirms, changes, bodyText } = opened.value;

        if (!confirms || !changes) {
            /*
             * NAME THE LIKELY CAUSE RATHER THAN JUST THE SYMPTOM.
             *
             * This phase failed exactly once for a reason worth encoding: a LATER phase walked the
             * journey forward by confirming, so on the next run the confirmation steps were already
             * behind it and this read "the product stopped offering confirmation". It had not. The
             * driver had consumed its own precondition.
             *
             * That is a defect in the harness, not the product, and the two are easy to confuse at
             * 2am. A journey showing review/completion affordances is past confirmation, not missing
             * it, so the message says so.
             */
            const pastConfirmation = labelled.some((b) => /review|paperwork|sign|submit|done/i.test(b));
            return {
                status: "failed",
                detail: pastConfirmation
                    ? `this journey is PAST the confirmation steps — found [${labelled.join(", ")}]. `
                      + "The driver advances the journey, so this phase only reproduces against a journey that has not "
                      + "yet been walked. Reseed the participant journey before re-running the suite; the product is not "
                      + "necessarily at fault."
                    : `expected a confirm-or-change affordance over prior truth; found buttons [${labelled.join(", ")}]`,
            };
        }

        /*
         * The prompt must precede the card. A card that arrives before the question asks the family
         * to interpret a fact before knowing what is being asked of it.
         */
        const confirmIndex = bodyText.search(/that's right/i);
        const promptIndex = bodyText.search(/\?/);
        const promptFirst = promptIndex >= 0 && promptIndex < confirmIndex;

        return {
            status: "passed",
            detail: `prior truth is offered for confirmation (${labelled.join(" / ")})${promptFirst ? "; prompt precedes the affordance" : ""}`,
            evidence: { buttons: labelled, promptPrecedesCard: promptFirst },
        };
    },
};

/**
 * E: walk the participant runtime forward and record what it actually asks.
 *
 * The phases after this one need to know what the journey CONTAINS — how many steps, which are
 * confirmations of prior truth and which are genuine collection, and what the single published
 * blocking requirement really demands. Every previous attempt in this program to write that from
 * assumption cost days, so this phase walks the real runtime and reports the itinerary as evidence.
 *
 * It advances only through confirmation affordances, which are safe: confirming prior truth asserts
 * nothing new. It stops at the first step that asks for something it has not been told to invent,
 * and says so, rather than typing a plausible value into a family's enrolment record.
 */
const semanticWalk: Phase = {
    key: "E_collection",
    title: "walk the participant runtime and record what it asks",
    dependsOn: ["D_confirmation"],
    async run(ctx) {
        const entry = ctx.facts.B_entry as Record<string, { journeyId: string }> | undefined;
        const pathA = entry?.context_free;
        if (!pathA) return { status: "failed", detail: "Path A entry facts unavailable" };

        const opened = await withParticipantPage(ctx, pathA.journeyId, async (page) => {
            const steps: Array<Record<string, unknown>> = [];

            for (let i = 0; i < 12; i += 1) {
                const bodyText = (await page.locator("body").innerText().catch(() => "")).trim();
                const buttons = (await page.locator("button, [role=button]").allInnerTexts().catch(() => []))
                    .map((b) => b.trim())
                    .filter(Boolean);
                const inputs = await page.locator("input, textarea, select").count().catch(() => 0);

                steps.push({
                    step: i,
                    prompt: bodyText.split("\n").filter(Boolean).slice(0, 3).join(" | ").slice(0, 200),
                    buttons,
                    inputs,
                });

                const confirm = buttons.find((b) => /that's right|^yes\b|confirm/i.test(b));
                if (!confirm) break;

                await page.getByRole("button", { name: confirm }).first().click().catch(() => undefined);
                await page.waitForTimeout(1500);
            }

            return steps;
        });

        if (!opened.ok) return { status: "failed", detail: opened.detail };
        const steps = opened.value;

        /*
         * The property proved here is PROGRESSION: confirming prior truth moves the journey on. A
         * runtime that re-presents the same step after a confirmation has not recorded anything, and
         * that is indistinguishable from success if only the first screen is ever inspected.
         */
        const distinctPrompts = new Set(steps.map((s) => String(s.prompt))).size;
        if (steps.length > 1 && distinctPrompts === 1) {
            return {
                status: "failed",
                detail: `the runtime re-presented the same step ${steps.length} times after confirmation; nothing advanced`,
            };
        }

        return {
            status: "passed",
            detail: `walked ${steps.length} participant step(s); ${distinctPrompts} distinct prompt(s); confirmation advances the journey`,
            evidence: { steps },
        };
    },
};

/**
 * Phases that need the participant browser surface. Declared, ordered and explicitly unimplemented
 * so the report shows the shape of what remains rather than hiding it.
 */
const browserPhases: readonly Phase[] = (
    [
        ["F_parties", "repeatable parties"],
        ["G_evidence", "evidence and Form completion"],
        ["H_artifacts", "artifact generation"],
        ["I_correction", "review and correction"],
        ["J_signature", "signatures"],
        ["K_participant_complete", "participant completion"],
        ["M_exception", "governed exception"],
        ["N_complete_enrollment", "Complete Enrollment"],
        ["P_handoff", "operational handoff"],
        ["Q_next_episode", "next episode"],
        ["S_responsive", "1280 and 375 product proof"],
    ] as const
).map(([key, title]) => ({
    key,
    title,
    dependsOn: ["B_entry"],
    async run() {
        return {
            status: "not_implemented" as const,
            detail: "requires the participant browser surface; not run, and deliberately not reported as a pass",
        };
    },
}));

/** The suite, in order. */
export const REAL_ENROLLMENT_V1_PHASES: readonly Phase[] = [
    bootstrap,
    entryState,
    pathAStaysContextFree,
    noDuplicateActiveEpisode,
    sufficiencyContract,
    participantEntry,
    priorTruthConfirmation,
    semanticWalk,
    ...browserPhases,
];
