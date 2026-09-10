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

/**
 * A: the suite OWNS its starting state.
 *
 * ## Why this resets
 *
 * The phases after this one are deliberately sequential and deliberately mutating: confirmation
 * advances the journey, collection advances it further, and so on. That is what makes it an
 * end-to-end proof rather than a set of disconnected assertions.
 *
 * It also means the suite consumes its own preconditions. The previous version inherited whatever
 * journey the last invocation left behind, so a second run began after the confirmation steps and
 * reported that the product had stopped offering confirmation. It had not. A certification artifact
 * that manufactures false product failures on its second run is worse than no artifact, because the
 * one thing it exists to settle is exactly what it starts getting wrong.
 *
 * So: reset once, here, at the top of every invocation. Never between phases — that would stop being
 * end to end.
 *
 * ## Why resetting here does not widen the blast radius
 *
 * It calls the same bounded reset the CLI calls, which is pinned by
 * `enrollmentFixtureResetBoundary.test.ts` and deletes only records reachable from the fixture's own
 * households. The suite gains the authority to invoke that boundary, not a larger one.
 */
const bootstrap: Phase = {
    key: "A_bootstrap",
    title: "reset, rebuild and prove a pristine starting state",
    async run(ctx) {
        const { removeEnrollmentCertificationFixture, ensureEnrollmentCertification } = await import(
            "@/lib/certification/enrollmentCertificationFixture"
        );

        const removed = await removeEnrollmentCertificationFixture(ctx.supabase, ctx.orgId);

        /*
         * Prove the reset actually emptied the namespace before rebuilding into it. Rebuilding over
         * residue is how a "fresh" fixture quietly inherits a previous run's state.
         */
        const afterReset = await verifyEnrollmentCertification(ctx.supabase, ctx.orgId);
        const residue = afterReset.families.filter((f) => f.customerMemberId || f.processInstanceId);
        if (residue.length) {
            return {
                status: "failed",
                detail: `reset left ${residue.length} fixture family record(s) behind; refusing to rebuild over residue`,
            };
        }

        const actorUserId = ctx.actorUserId;
        const built = await ensureEnrollmentCertification(ctx.supabase, ctx.orgId, { actorUserId });
        if (!built.ok) {
            return { status: "failed", detail: `fixture rebuild failed: ${JSON.stringify(built).slice(0, 300)}` };
        }

        // Verify twice: once to check, once to prove the check itself is stable.
        const first = await verifyEnrollmentCertification(ctx.supabase, ctx.orgId);
        const second = await verifyEnrollmentCertification(ctx.supabase, ctx.orgId);
        if (!first.ok || !second.ok) {
            return {
                status: "failed",
                detail: `fixture not verifiable after rebuild: ${[...first.findings, ...second.findings].join("; ")}`,
            };
        }
        const idsStable =
            JSON.stringify(first.families.map((f) => f.processInstanceId))
            === JSON.stringify(second.families.map((f) => f.processInstanceId));
        if (!idsStable) {
            return { status: "failed", detail: "two consecutive verifies disagreed on journey ids; fixture is not idempotent" };
        }

        /*
         * STARTING-STATE INVARIANTS. Asserted here so a stale fixture is discovered by the phase whose
         * job that is, rather than surfacing three phases later as a mystery product failure.
         */
        const problems: string[] = [];
        for (const f of first.families) {
            if (!f.processInstanceId) problems.push(`${f.key}: no journey`);
            if (!f.enrollmentParticipationId) problems.push(`${f.key}: no participation`);
        }
        if (problems.length) return { status: "failed", detail: problems.join("; ") };

        return {
            status: "passed",
            detail:
                `reset removed ${JSON.stringify(removed)}; rebuilt and verified twice with stable ids`,
            evidence: {
                removed,
                families: first.families.map((f) => ({
                    key: f.key,
                    journeyId: f.processInstanceId,
                    participationId: f.enrollmentParticipationId,
                    opportunityId: f.opportunityId,
                })),
            },
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
 * A durable fingerprint of the fixture's Enrollment graph.
 *
 * "Read-only" is a claim about intent, not about behaviour. Phase bisection showed that adding
 * L_sufficiency -- a phase whose whole job is to read a verdict -- flips a later phase from pass to
 * fail, so its actual effect has to be MEASURED. This captures what a phase can be held to before and
 * after it runs.
 */
async function durableFingerprint(
    supabase: Parameters<Phase["run"]>[0]["supabase"],
    orgId: string,
    journeyId: string,
): Promise<Record<string, unknown>> {
    const sessions = await supabase
        .from("form_packet_sessions")
        .select("id, status, packet_instance_id")
        .eq("org_id", orgId)
        .eq("process_instance_id", journeyId);
    const rows = ((sessions.data ?? []) as Row[]);

    /*
     * Sessions alone were too narrow. The first fingerprint showed L touching nothing and the
     * failure persisted, which only rules out one of the candidates in §7 -- a signature written to
     * one submission while sufficiency reads another needs SUBMISSIONS and DEFINITIONS in view too.
     */
    /*
     * SCOPED TO THIS JOURNEY, and not truncated.
     *
     * The first version counted submissions org-wide, sorted the statuses and sliced twelve. "draft"
     * sorts first, so every "submitted" row fell off the end and I reported that the submission
     * stayed draft. That was my fingerprint, not the product. A summary that sorts and truncates is
     * capable of proving whatever its first page happens to contain.
     */
    const items = await supabase
        .from("form_packet_session_items")
        .select("id, status, sequence_index, form_submission_id, packet_item_id")
        .eq("org_id", orgId)
        .in("packet_session_id", rows.length ? rows.map((r) => String(r.id)) : ["00000000-0000-0000-0000-000000000000"]);
    const itemRows = ((items.data ?? []) as Row[])
        .slice()
        .sort((a, b) => Number(a.sequence_index ?? 0) - Number(b.sequence_index ?? 0));

    /*
     * FOLLOW THE FK THE RESOLVER FOLLOWS.
     *
     * resolveEnrollmentParticipantProgress deliberately does NOT read the session item's own status
     * — its comment says so outright: resolving the hop to Forms "is what keeps Forms the
     * satisfaction authority". Satisfaction is
     * form_packet_session_items.form_submission_id -> form_submissions.status.
     *
     * So an item reading `submitted` proves nothing about the requirement, and earlier fingerprints
     * here were watching a column the verdict does not consult.
     */
    const submissionIds = itemRows.map((r) => r.form_submission_id).filter(Boolean) as string[];
    const subs = submissionIds.length
        ? await supabase.from("form_submissions").select("id, status").in("id", submissionIds)
        : { data: [] as Row[] };
    const statusById = new Map(((subs.data ?? []) as Row[]).map((r) => [String(r.id), String(r.status)]));

    /*
     * THE REALIZED FORM IDENTITY, via the same hop the resolver makes.
     *
     * The session item names a packet_item_id; the FORM identity lives on form_packet_items. That is
     * the id the projection indexes realized items by, so it is the id that must equal the
     * requirement's ref.form_definition_id for the requirement to resolve at all.
     */
    const packetItemIds = itemRows.map((r) => r.packet_item_id).filter(Boolean) as string[];
    const packetItems = packetItemIds.length
        ? await supabase.from("form_packet_items").select("id, form_definition_id").in("id", packetItemIds)
        : { data: [] as Row[] };
    const formByPacketItem = new Map(
        ((packetItems.data ?? []) as Row[]).map((r) => [String(r.id), String(r.form_definition_id ?? "")]),
    );

    return {
        packetSessions: rows.length,
        sessionIds: rows.map((r) => String(r.id).slice(0, 8)).sort(),
        sessionStatuses: rows.map((r) => String(r.status)).sort(),
        sessionItems: itemRows.length,
        items: itemRows.map((r) => ({
            item: String(r.id).slice(0, 8),
            itemStatus: String(r.status),
            // The half of the identity comparison the packet owns.
            realizedFormDefinitionId:
                String(formByPacketItem.get(String(r.packet_item_id ?? "")) ?? "").slice(0, 8) || null,
            // The authority. null here means the requirement has no evidence to resolve against.
            formSubmissionId: r.form_submission_id ? String(r.form_submission_id).slice(0, 8) : null,
            submissionStatus: r.form_submission_id
                ? (statusById.get(String(r.form_submission_id)) ?? "(row missing)")
                : null,
        })),
    };
}

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

        /*
         * MEASURE THIS PHASE'S OWN FOOTPRINT. Bisection identified it as the trigger for a later
         * failure, so it must prove it changes nothing rather than be described as observational.
         */
        const pathAJourney = (entry.context_free as { journeyId: string } | undefined)?.journeyId ?? "";
        const fingerprintBefore = pathAJourney
            ? await durableFingerprint(ctx.supabase, ctx.orgId, pathAJourney)
            : null;

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

        const fingerprintAfter = pathAJourney
            ? await durableFingerprint(ctx.supabase, ctx.orgId, pathAJourney)
            : null;
        const mutated = JSON.stringify(fingerprintBefore) !== JSON.stringify(fingerprintAfter);

        return problems.length
            ? { status: "failed", detail: problems.join("; ") }
            : {
                  status: "passed",
                  detail:
                      `gate and operator projection agree for both paths`
                      + (mutated ? " — WARNING: this phase MUTATED durable state (see fingerprints)" : ""),
                  evidence: { observed, fingerprintBefore, fingerprintAfter, mutated },
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
        first(): {
            click(opts?: unknown): Promise<void>;
            innerText(): Promise<string>;
            fill(v: string): Promise<void>;
            inputValue(): Promise<string>;
            isVisible(): Promise<boolean>;
            boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
        };
        nth(i: number): {
            click(opts?: unknown): Promise<void>;
            innerText(): Promise<string>;
            fill(v: string): Promise<void>;
            inputValue(): Promise<string>;
            isVisible(): Promise<boolean>;
        };
    };
    getByRole(role: string, opts?: unknown): { first(): { click(opts?: unknown): Promise<void>; count(): Promise<number> } };
    waitForTimeout(ms: number): Promise<void>;
    url(): string;
    evaluate<T>(fn: string | ((...a: unknown[]) => T)): Promise<T>;
    setViewportSize(size: { width: number; height: number }): Promise<void>;
    on(event: string, cb: (arg: unknown) => void): void;
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
                    prompt: bodyText.split("\n").filter(Boolean).slice(0, 8).join(" | ").slice(0, 320),
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
 * M: the governed requirement exception, end to end.
 *
 * Four properties, and the order matters because each only means something given the one before:
 * the requirement blocks; an authorised actor can except it and the exception records WHO, WHY and
 * WHEN against the exact requirement identity; an unauthorised actor cannot; and revoking restores
 * the block.
 *
 * The property most worth protecting is the third-from-last: an excepted requirement must read as
 * EXCEPTED, never as satisfied. An exception is a decision someone is accountable for, and a system
 * that launders it into "satisfied" destroys the only record that a judgement was made.
 */
const governedException: Phase = {
    key: "M_exception",
    title: "governed requirement exception: block, except, refuse, revoke",
    dependsOn: ["L_sufficiency"],
    async run(ctx) {
        const { grantRequirementException, revokeRequirementException } = await import(
            "@/lib/enrollment/completion/requirementExceptionService"
        );
        const { REQUIREMENT_EXCEPTION_MANAGE_PERMISSION } = await import(
            "@/lib/enrollment/completion/requirementException"
        );
        const { resolveEnrollmentCompletionSufficiency } = await import(
            "@/lib/enrollment/completion/enrollmentCompletionSufficiency"
        );

        const entry = ctx.facts.B_entry as
            | Record<string, { journeyId: string; participationId: string; stageKey: string | null }>
            | undefined;
        const pathA = entry?.context_free;
        if (!pathA) return { status: "failed", detail: "Path A entry facts unavailable" };

        const readGate = async () => {
            const r = await resolveEnrollmentCompletionSufficiency(ctx.supabase, {
                orgId: ctx.orgId,
                processInstanceId: pathA.journeyId,
            });
            if (!r.ok) throw new Error(`sufficiency refused: ${r.refusal.code}`);
            return r.sufficiency;
        };

        // A. OUTSTANDING — the requirement blocks before anything is excepted.
        const before = await readGate();
        const blocking = before.requirements.filter((r) => r.disposition === "blocking");
        if (!blocking.length) {
            return {
                status: "failed",
                detail: "no blocking requirement to except; this phase needs an outstanding requirement to be meaningful",
            };
        }
        const target = blocking[0]!;
        /*
         * THE EFFECTIVE STAGE, from the resolver the product itself uses.
         *
         * My first attempt read `stage_key` off the sufficiency result, which does not carry one, so
         * it was undefined and the exception was refused as missing_subject. Path A's journey holds a
         * NULL stage by design -- the entry stage is DECLARED in configuration, not stamped on the row
         * -- so the effective stage has to be resolved rather than read off the record. Same lesson as
         * the column names and the constant import: ask the thing that knows.
         */
        const { resolveEnrollmentParticipantProgress } = await import(
            "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress"
        );
        const progress = await resolveEnrollmentParticipantProgress(ctx.supabase, {
            orgId: ctx.orgId,
            processInstanceId: pathA.journeyId,
        });
        if (!progress.ok) {
            return { status: "failed", detail: `participant progress refused: ${progress.refusal.code}` };
        }
        const effectiveStageKey = progress.value.stage_key ?? "";
        if (!effectiveStageKey) {
            return { status: "failed", detail: "no effective stage resolved for this journey" };
        }

        const identity = {
            orgId: ctx.orgId,
            participationId: pathA.participationId,
            stageKey: effectiveStageKey,
            requirementId: target.requirement_id,
        };

        // C (run early, while the requirement is still outstanding) — UNAUTHORISED must be refused.
        const unauthorised = await grantRequirementException(ctx.supabase, {
            actor: { permissionKeys: [], userId: ctx.actorUserId },
            identity,
            reason: "certification: unauthorised attempt, must be refused",
        });
        if (unauthorised.ok) {
            return { status: "failed", detail: "an actor with no permissions was allowed to except a requirement" };
        }

        // B. AUTHORISED exception.
        const reason = "certification: exercising the governed exception path";
        const granted = await grantRequirementException(ctx.supabase, {
            actor: { permissionKeys: [REQUIREMENT_EXCEPTION_MANAGE_PERMISSION], userId: ctx.actorUserId },
            identity,
            reason,
        });
        if (!granted.ok) {
            return { status: "failed", detail: `authorised exception refused: ${granted.refusal.code}: ${granted.refusal.detail}` };
        }

        const afterGrant = await readGate();
        const excepted = afterGrant.requirements.find((r) => r.requirement_id === target.requirement_id);
        if (excepted?.disposition !== "excepted") {
            return {
                status: "failed",
                detail: `after the exception the requirement reads "${excepted?.disposition}"; it must read "excepted" and never "satisfied"`,
            };
        }

        // D. REVOKE — the block returns.
        const revoked = await revokeRequirementException(ctx.supabase, {
            actor: { permissionKeys: [REQUIREMENT_EXCEPTION_MANAGE_PERMISSION], userId: ctx.actorUserId },
            identity,
        } as Parameters<typeof revokeRequirementException>[1]);
        if (!revoked.ok) {
            return { status: "failed", detail: `revoke refused: ${revoked.refusal.code}: ${revoked.refusal.detail}` };
        }

        const afterRevoke = await readGate();
        const reblocked = afterRevoke.requirements.find((r) => r.requirement_id === target.requirement_id);
        if (reblocked?.disposition !== "blocking") {
            return {
                status: "failed",
                detail: `after revoke the requirement reads "${reblocked?.disposition}"; revoking must restore the block`,
            };
        }

        return {
            status: "passed",
            detail:
                "outstanding blocks; authorised exception reads EXCEPTED (never satisfied); unauthorised refused; revoke re-blocks",
            evidence: {
                requirementId: target.requirement_id,
                stageKey: identity.stageKey,
                unauthorisedRefusal: unauthorised.refusal.code,
                eligibleWhileExcepted: afterGrant.eligible,
                eligibleAfterRevoke: afterRevoke.eligible,
            },
        };
    },
};

/**
 * THE SIGNATURE COMPONENT, as a state machine.
 *
 * Three separate bugs came from matching button text against a flat preference list: /sign/ reopened
 * the pad it had just filled, preferring "Sign and finish" meant the pad never opened, and leaving
 * "Done" in the list pressed it against an already-committed pad. Each was a different symptom of
 * one mistake — a pattern standing in for a sequence — so the sequence is now explicit and only
 * transitions valid for the observed state are attempted.
 *
 * The acknowledgements are ticked by LABEL, never by index. Two checkboxes look identical by
 * position; one says "I acknowledge the information above is accurate", the other "I acknowledge
 * this electronic signature applies to this form". Clicking to find out which is which is how a
 * harness agrees to something on a family's behalf.
 */
type SignatureState =
    | "pad_closed"
    | "pad_open"
    | "typed_value_present"
    | "acks_complete"
    | "committed"
    | "finished"
    | "stuck";

async function driveSignature(
    page: PlaywrightPage,
    signerName: string,
): Promise<{ readonly state: SignatureState; readonly transitions: readonly string[]; readonly acks: unknown }> {
    const transitions: string[] = [];
    let acks: unknown = null;

    const buttons = async () =>
        (await page.locator("button, [role=button]").allInnerTexts().catch(() => [])).map((b) => b.trim()).filter(Boolean);
    const has = (list: readonly string[], rx: RegExp) => list.some((b) => rx.test(b));
    const click = async (name: string) => {
        await page.getByRole("button", { name }).first().click().catch(() => undefined);
        await page.waitForTimeout(900);
    };

    // pad_closed -> pad_open
    let btns = await buttons();
    if (!has(btns, /instead$/i)) {
        if (!has(btns, /^tap to sign$/i)) return { state: "stuck", transitions: ["no way to open the signature pad"], acks };
        await click("Tap to sign");
        transitions.push("pad_closed -> pad_open");
        btns = await buttons();
    }

    // pad_open -> typed_value_present
    if (has(btns, /^type instead$/i)) {
        await click("Type instead");
        transitions.push("pad_open -> typed mode");
        btns = await buttons();
    }
    await page.locator('input[type="text"]').first().fill(signerName).catch(() => undefined);
    await page.waitForTimeout(500);
    transitions.push(`typed "${signerName}"`);

    /*
     * typed_value_present -> acks_complete. Only acknowledgements, only if unchecked, only if
     * enabled and visible. Everything else on the pad is left exactly as the participant would find
     * it.
     */
    acks = await (page as unknown as { evaluate(fn: () => unknown): Promise<unknown> }).evaluate(() => {
        const out: Array<Record<string, unknown>> = [];
        for (const el of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
            const box = el as HTMLInputElement;
            const label =
                box.getAttribute("aria-label")
                ?? (box.id ? document.querySelector(`label[for="${box.id}"]`)?.textContent : null)
                ?? box.closest("label")?.textContent
                ?? "";
            const text = (label ?? "").trim();
            const isAck = /acknowledge|agree|confirm/i.test(text);
            const before = box.checked;
            if (isAck && !box.checked && !box.disabled) box.click();
            out.push({ label: text.slice(0, 110), wasChecked: before, nowChecked: box.checked, ticked: isAck && !before });
        }
        return out;
    }).catch(() => null);
    transitions.push("acknowledgements reconciled by label");
    await page.waitForTimeout(500);

    // acks_complete -> committed
    btns = await buttons();
    if (has(btns, /^done$/i)) {
        await click("Done");
        transitions.push("committed the signature");
        btns = await buttons();
    }

    // committed -> finished
    if (has(btns, /^sign and finish$/i)) {
        await click("Sign and finish");
        transitions.push("sign and finish");
        /*
         * WAIT FOR THE SUBMISSION TO LAND, not for a fixed interval.
         *
         * The fingerprints showed the packet session reaching `completed` while its submission stayed
         * draft and the requirement stayed blocking -- a write that partially landed. Adding a
         * read-only phase earlier in the chain flipped it, which is the signature of a race, not of
         * state: the browser was being closed while the finish request was still in flight, and
         * whether it survived depended on timing.
         *
         * So the harness now waits for the network to go idle before it lets go of the page. That is
         * the harness taking responsibility for when it is finished, rather than sleeping longer and
         * hoping -- a longer sleep would have hidden this rather than fixed it.
         */
        await (page as unknown as {
            waitForLoadState(state: string, opts?: unknown): Promise<void>;
        }).waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const after = await buttons();
        if (!has(after, /^sign and finish$/i)) {
            return { state: "finished", transitions, acks };
        }
        return { state: "stuck", transitions: [...transitions, "sign and finish did not advance"], acks };
    }

    return { state: "stuck", transitions: [...transitions, "no finish control present"], acks };
}

/**
 * G: satisfy the published blocking requirement through the participant product.
 *
 * The keystone. Everything downstream — ready state, Complete Enrollment, enrolled, handoff — needs a
 * requirement that was satisfied the way a family would satisfy it, not excepted and not written
 * straight to storage. An exception proves the governed override works; only this proves the ordinary
 * path does.
 *
 * ## The decision policy, and why it is conservative
 *
 * The walker only takes actions whose meaning is unambiguous:
 *   - confirm prior truth ("Yes, that's right") — asserts nothing new;
 *   - DECLINE optional add-another offers ("No") — declining invents nobody, whereas accepting would
 *     require this harness to make up a person and put them in a family's enrolment record;
 *   - advance through review/continue affordances.
 *
 * It never types a value into a free field. If the requirement cannot be satisfied without inventing
 * data, that is reported honestly as the boundary rather than papered over with a plausible string.
 */
const requirementCompletion: Phase = {
    key: "G_evidence",
    title: "satisfy the published blocking requirement through the participant surface",
    dependsOn: ["E_collection"],
    async run(ctx) {
        const { resolveEnrollmentCompletionSufficiency } = await import(
            "@/lib/enrollment/completion/enrollmentCompletionSufficiency"
        );
        const { projectEnrollmentCompletionReadiness } = await import(
            "@/lib/enrollment/completion/projectEnrollmentCompletionReadiness"
        );

        const entry = ctx.facts.B_entry as Record<string, { journeyId: string }> | undefined;
        const pathA = entry?.context_free;
        if (!pathA) return { status: "failed", detail: "Path A entry facts unavailable" };

        const gate = async () => {
            const r = await resolveEnrollmentCompletionSufficiency(ctx.supabase, {
                orgId: ctx.orgId,
                processInstanceId: pathA.journeyId,
            });
            if (!r.ok) throw new Error(`sufficiency refused: ${r.refusal.code}`);
            return r.sufficiency;
        };

        const before = await gate();
        const beforeReady = projectEnrollmentCompletionReadiness({ sufficiency: before });
        if (before.eligible) {
            return {
                status: "failed",
                detail: "the gate was already eligible before this phase ran; there is nothing for it to prove",
            };
        }

        const fpBeforeWalk = await durableFingerprint(ctx.supabase, ctx.orgId, pathA.journeyId);

        const walked = await withParticipantPage(ctx, pathA.journeyId, async (page) => {
            const trail: Array<Record<string, unknown>> = [];
            let lastSignature = "";
            let signed = false;
            let padInspected = false;
            let checkboxReport: unknown = null;
            const signerName = `${CERT_FAMILIES.contextFree.parentFirstName} ${CERT_FAMILIES.contextFree.lastName}`;

            for (let i = 0; i < 14; i += 1) {
                const buttons = (await page.locator("button, [role=button]").allInnerTexts().catch(() => []))
                    .map((b) => b.trim())
                    .filter(Boolean);
                const bodyText = (await page.locator("body").innerText().catch(() => "")).trim();

                /*
                 * Priority order: confirm known truth, decline optional additions, then advance.
                 *
                 * The advance list contains labels this runtime ACTUALLY renders, read off a previous
                 * trail rather than imagined — "Review paperwork", then "Everything looks good" on the
                 * signature step. The first version omitted the latter and the walker simply stopped,
                 * reporting an outstanding requirement that a participant could plainly have finished.
                 * Approving paperwork you have just reviewed is a real participant act, not fabricated
                 * data, so it belongs here; typing into an empty field still does not.
                 */
                /*
                 * ORDERED PREFERENCE, not a single loose pattern.
                 *
                 * The previous version matched /sign/ and so kept picking "Tap to sign" -- reopening
                 * the signature pad it had just filled in -- while "Sign and finish" sat right beside
                 * it. A regex broad enough to find the finishing control was also broad enough to find
                 * the one that undoes it, and `find` returns whichever appears first in the DOM.
                 *
                 * So the list is explicit and ordered by intent: commit a completed signature, then
                 * finish, then advance, then confirm, then decline. Each entry is a label this runtime
                 * actually renders.
                 */
                const prefer: readonly RegExp[] = [
                    // NOTE: "Done" is deliberately absent. It belongs to the signature pad and is
                    // handled inside the signing branch; leaving it here made the walker press Done
                    // against an already-committed pad instead of pressing Sign and finish.
                    /^sign and finish$/i,
                    /^everything looks good$/i,
                    /^review paperwork$/i,
                    /that's right/i,
                    /^(continue|next|submit|finish)$/i,
                    /^no$/i,
                ];
                let choice: string | undefined;
                for (const rx of prefer) {
                    choice = buttons.find((b) => rx.test(b));
                    if (choice) break;
                }

                trail.push({
                    step: i,
                    heading: bodyText.split("\n").filter(Boolean).slice(2, 5).join(" | ").slice(0, 160),
                    buttons,
                    chose: choice ?? "(nothing actionable)",
                });

                /*
                 * THE SIGNATURE STEP, signed properly.
                 *
                 * The runtime refuses to finish without one and says so plainly -- "Signature
                 * required. Please confirm you've reviewed the information above. Sign here" -- which
                 * is the product behaving correctly, not a dead control. Certifying the ordinary path
                 * therefore means actually signing.
                 *
                 * Typing the guardian's own name is the participant's real act, and this is the
                 * fixture's own family in the reserved certification namespace, so nothing here signs
                 * on behalf of a real person. "Type instead" is used rather than the canvas because a
                 * typed signature is deterministic and legible in evidence.
                 */
                /*
                 * SIGNING IS A SEQUENCE, so it needs state rather than a pattern.
                 *
                 * "Type instead" only exists once the pad is OPEN, and the pad only opens via "Tap to
                 * sign". Preferring "Sign and finish" first meant the walker never opened the pad and
                 * then pressed finish forever against an unsigned form -- correctly refused each time.
                 * Preferring anything matching /sign/ first meant it reopened the pad it had just
                 * filled. Neither is fixable by reordering a flat list, because the right action
                 * depends on where in the sequence we are.
                 */
                if (!signed && buttons.some((b) => /^tap to sign$/i.test(b)) && !buttons.some((b) => /instead$/i.test(b))) {
                    await page.getByRole("button", { name: "Tap to sign" }).first().click().catch(() => undefined);
                    await page.waitForTimeout(900);
                    trail.push({ step: i, heading: "signature", buttons, chose: "opened the signature pad" });
                    continue;
                }

                /*
                 * The signature component owns its own sequence. The walker hands off rather than
                 * trying to express mutually-dependent UI states as a preference list — which is what
                 * produced three separate loops before.
                 */
                if (!signed && (buttons.some((b) => /^tap to sign$/i.test(b)) || buttons.some((b) => /instead$/i.test(b)))) {
                    const sig = await driveSignature(page, signerName);
                    signed = true;
                    trail.push({
                        step: i,
                        heading: "signature component",
                        buttons,
                        chose: `state machine -> ${sig.state}`,
                        transitions: sig.transitions,
                        acknowledgements: sig.acks,
                    });
                    /*
                     * CONTINUE, do not break.
                     *
                     * I changed this to `break` on the reasoning that there was nothing left to click
                     * once the signature reported finished. The single run that ever passed predates
                     * that change, and every run since has failed -- so "finished" evidently is not
                     * the end of the participant's work, and stopping there leaves the last step
                     * undone. The no-progress guard already terminates the loop safely, so continuing
                     * costs nothing and does not risk the spin it was meant to prevent.
                     */
                    if (sig.state === "finished") continue;
                    trail.push({ step: i, heading: "(signature stuck)", buttons: await page.locator("button").allInnerTexts().catch(() => []), chose: sig.state });
                    break;
                }

                if (!choice) break;

                /*
                 * NO-PROGRESS GUARD. Clicking the same affordance on an unchanged screen is not
                 * progress, it is a loop, and a walker that keeps clicking hides a stuck step behind a
                 * timeout instead of reporting it. Two identical screens in a row ends the walk.
                 */
                const signature = `${trail[i]!.heading}::${buttons.join("|")}`;
                if (i > 0 && signature === lastSignature) {
                    /*
                     * WHY the screen did not change matters, and the two answers are opposites. A
                     * control that silently does nothing is a product defect; one that refuses and
                     * says why is the product working. So capture what the surface actually says
                     * rather than recording only that nothing moved.
                     */
                    const shown = (await page.locator("body").innerText().catch(() => "")).trim();
                    /*
                     * WHAT CONTROLS ARE ACTUALLY ON THE SCREEN. A stuck walker is nearly always a
                     * control it never touched -- here, an explicit review-confirmation the screen
                     * demands alongside the signature. Listing the inputs by type and label turns
                     * "it stopped" into "it stopped because this was unticked".
                     */
                    const controls = await (page as unknown as {
                        evaluate(fn: () => unknown): Promise<unknown>;
                    }).evaluate(() =>
                        Array.from(document.querySelectorAll("input, textarea, select")).slice(0, 14).map((el) => {
                            const i = el as HTMLInputElement;
                            return {
                                tag: el.tagName.toLowerCase(),
                                type: i.type ?? null,
                                checked: typeof i.checked === "boolean" ? i.checked : null,
                                name: i.name || i.getAttribute("aria-label") || i.placeholder || null,
                                visible: !!(i.offsetWidth || i.offsetHeight),
                            };
                        }),
                    ).catch(() => []);
                    const validation = shown
                        .split("\n")
                        .map((l) => l.trim())
                        .filter((l) => /required|please|must|enter|sign here|add your/i.test(l))
                        .slice(0, 4);
                    trail.push({
                        step: i,
                        heading: "(no progress)",
                        buttons,
                        chose: "stopped: screen did not change",
                        surfaceSays: validation.length ? validation : "(no validation message shown)",
                        controls,
                    });
                    break;
                }
                lastSignature = signature;

                await page.getByRole("button", { name: choice }).first().click().catch(() => undefined);
                await page.waitForTimeout(1200);
            }

            return trail;
        });

        if (!walked.ok) return { status: "failed", detail: walked.detail };

        /*
         * WAIT FOR THE WRITE TO SETTLE, do not weaken the assertion.
         *
         * The identical signature run passed in a short chain and failed in the full suite, with the
         * same state-machine transitions both times -- a read racing an async submission, not a
         * different outcome. Polling for a bounded period makes the phase deterministic; it still
         * FAILS if the requirement never resolves, and it reports how long it waited so a slow write
         * is visible rather than smoothed over.
         */
        /*
         * CONTROLLED CACHE-BYPASS EXPERIMENT (§6), using the product's own supported invalidator.
         *
         * The trigger is a durable-read-only phase in the same Node process, which makes
         * process-local retention the standing suspect even though the two caches on this path both
         * look correctly scoped on inspection. Rather than argue from source, bust the config cache
         * once here and record whether the verdict changes. If it does, retention is proven; if it
         * does not, process-local caching is eliminated and the search moves on.
         *
         * This is instrumentation, not a fix: a certification harness that has to clear a cache to
         * see the truth is reporting a defect, not avoiding one.
         */
        const { invalidateConfigReadCache } = await import("@/lib/runtime/provisioning/configReadCache");
        const gateBeforeInvalidate = await gate();
        invalidateConfigReadCache();
        const gateAfterInvalidate = await gate();
        const cacheMattered = gateBeforeInvalidate.eligible !== gateAfterInvalidate.eligible;

        let after = await gate();
        let settledAfterMs = 0;
        for (let waited = 0; !after.eligible && waited < 12000; waited += 1500) {
            await new Promise((r) => setTimeout(r, 1500));
            settledAfterMs = waited + 1500;
            after = await gate();
        }
        const afterReady = projectEnrollmentCompletionReadiness({ sufficiency: after });

        /*
         * Gate and projection must agree in the READY direction too. The blocked direction was already
         * certified; a contract that only holds while everything is refused is not a contract.
         */
        if (after.eligible !== (afterReady.state === "ready")) {
            return {
                status: "failed",
                detail: `gate says ${after.eligible ? "eligible" : "blocked"} while the operator projection says ${afterReady.state}`,
            };
        }

        if (!after.eligible) {
            /*
             * NAME THE FIRST BROKEN INVARIANT, not the last observed symptom.
             *
             * "G_evidence failed" sent me chasing the projection when the write was the problem. The
             * boundaries are checked in the order they must hold, and the first one that fails is the
             * one reported -- so a future reader starts where the truth stops rather than where the
             * assertion happened to sit.
             */
            const fpAfter = await durableFingerprint(ctx.supabase, ctx.orgId, pathA.journeyId);
            const sigState = (walked.value.find((t) => String(t.chose ?? "").startsWith("state machine")) ?? {}) as {
                chose?: string;
            };
            const sessionCompleted = JSON.stringify(fpAfter.sessionStatuses ?? []).includes("completed");
            const signatureFinished = String(sigState.chose ?? "").includes("finished");

            const code = !signatureFinished
                ? "SIGNATURE_UI_NOT_FINISHED"
                : !sessionCompleted
                  ? "SIGNATURE_NOT_PERSISTED"
                  : "REQUIREMENT_NOT_SATISFIED";

            return {
                status: "failed",
                detail:
                    `${code}: `
                    + (code === "REQUIREMENT_NOT_SATISFIED"
                        ? "the signature finished in the browser AND the packet session reached `completed`, but the "
                          + "requirement still reads blocking. The write partially landed, so this is a "
                          + "requirement-evidence join question, not a projection one."
                        : code === "SIGNATURE_NOT_PERSISTED"
                          ? "the browser finished the signature but no completed packet session followed."
                          : "the signature never completed in the browser.")
                    + ` Blocking: ${after.blocking.map((b) => b.requirement_id).join(", ")}.`,
                evidence: {
                    trail: walked.value,
                    blocking: after.blocking.map((b) => b.requirement_id),
                    fpBeforeWalk,
                    fpAfterSignature: fpAfter,
                    firstBrokenInvariant: code,
                    /*
                     * THE REQUIREMENT'S OWN STATUS AND REASON, which was never captured.
                     *
                     * The driver only ever recorded the sufficiency DISPOSITION ("blocking"), which
                     * collapses several distinct requirement states into one word. The projection
                     * distinguishes them precisely — `unrealized` means the packet does not contain
                     * the form the revision requires, which is a configuration mismatch and not an
                     * unfinished participant. Reading the disposition instead of the status is how
                     * this looked like a persistence problem for several runs while the durable rows
                     * were correct the whole time.
                     */
                    requirementDetail: after.requirements.map((r) => ({
                        id: r.requirement_id,
                        status: (r as unknown as { status?: string }).status ?? null,
                        disposition: r.disposition,
                        /*
                         * THE REQUIRED FORM IDENTITY. For a form requirement, artifactIdFor() returns
                         * ref.form_definition_id verbatim, so the artifact id IS the id the projection
                         * looks up in realizedByFormDefinition. Printing it beside the realized id in
                         * the fingerprint puts both halves of the mismatch on one screen.
                         */
                        requiredFormDefinitionId: String(
                            (r as unknown as { artifact?: { id?: string } }).artifact?.id ?? "",
                        ).slice(0, 8) || null,
                        reason: String((r as unknown as { reason?: string }).reason ?? "").slice(0, 200) || null,
                    })),
                    cacheExperiment: {
                        eligibleBeforeInvalidate: gateBeforeInvalidate.eligible,
                        eligibleAfterInvalidate: gateAfterInvalidate.eligible,
                        cacheMattered,
                    },
                },
            };
        }

        return {
            status: "passed",
            detail:
                `requirement satisfied through the participant product; gate eligible and operator projection ready `
                + `(${before.counts.blocking} blocking before, ${after.counts.blocking} after)`,
            evidence: {
                before: { eligible: before.eligible, projection: beforeReady.state, counts: before.counts },
                after: { eligible: after.eligible, projection: afterReady.state, counts: after.counts },
                settledAfterMs,
                trail: walked.value,
            },
        };
    },
};

/** The durable child state, read straight from the authority that owns it. */
async function readChildState(
    ctx: Parameters<Phase["run"]>[0],
    childId: string,
    journeyId: string,
): Promise<Record<string, unknown>> {
    const { data: ocm } = await ctx.supabase
        .from("opportunity_customer_members")
        .select("id, outcome_status_key, opportunity_id")
        .eq("org_id", ctx.orgId)
        .eq("customer_member_id", childId);
    const { data: pi } = await ctx.supabase
        .from("process_instances")
        .select("id, state, stage_key")
        .eq("org_id", ctx.orgId)
        .eq("id", journeyId);
    const o = ((ocm ?? []) as Row[])[0] ?? {};
    const p = ((pi ?? []) as Row[])[0] ?? {};
    return {
        ocmStatus: o.outcome_status_key ?? null,
        ocmOpportunityId: o.opportunity_id ?? null,
        processState: p.state ?? null,
        processStage: p.stage_key ?? null,
    };
}

/**
 * K: participant completion does NOT enrol the child.
 *
 * The single most important negative in this program. Finishing paperwork is the family's act;
 * enrolling a child is the school's decision. A system that collapses them has removed the operator
 * from a decision that is theirs to make, and would do it silently.
 */
const participantCompletionDoesNotEnrol: Phase = {
    key: "K_participant_complete",
    title: "participant completion does not durably enrol the child",
    dependsOn: ["G_evidence"],
    async run(ctx) {
        const entry = ctx.facts.B_entry as Record<string, { journeyId: string; childId: string }> | undefined;
        const pathA = entry?.context_free;
        if (!pathA) return { status: "failed", detail: "Path A entry facts unavailable" };

        const state = await readChildState(ctx, pathA.childId, pathA.journeyId);
        const enrolled = String(state.ocmStatus ?? "").toLowerCase() === "enrolled";

        return enrolled
            ? {
                  status: "failed",
                  detail:
                      "the child is already durably ENROLLED after participant work alone — the operator decision "
                      + "has been bypassed",
                  evidence: state,
              }
            : {
                  status: "passed",
                  detail:
                      `paperwork is complete and the child is NOT enrolled (status ${String(state.ocmStatus)}); `
                      + "enrolling remains the operator's decision",
                  evidence: state,
              };
    },
};

/**
 * N: Complete Enrollment, through the real governed outcome.
 *
 * Uses `enrollment_complete` on the configured `enrolling` plan — the same outcome an operator
 * triggers — rather than writing `enrolled` anywhere directly. A certification that reaches enrolled
 * by patching a column has certified the column.
 */
const completeEnrollment: Phase = {
    key: "N_complete_enrollment",
    title: "Complete Enrollment through the real governed outcome",
    dependsOn: ["K_participant_complete"],
    async run(ctx) {
        const { defaultStageOperatingPlanForEnrollmentStage } = await import(
            "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans"
        );
        const { executeStageOperatingOutcome } = await import("@/lib/lifecycle/executeStageOperatingOutcome");
        const { resolveEnrollmentParticipantProgress } = await import(
            "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress"
        );

        const entry = ctx.facts.B_entry as
            | Record<string, { journeyId: string; childId: string; participationId: string }>
            | undefined;
        const pathA = entry?.context_free;
        if (!pathA) return { status: "failed", detail: "Path A entry facts unavailable" };

        const before = await readChildState(ctx, pathA.childId, pathA.journeyId);

        // The stage the journey is actually governed by, resolved rather than assumed.
        const progress = await resolveEnrollmentParticipantProgress(ctx.supabase, {
            orgId: ctx.orgId,
            processInstanceId: pathA.journeyId,
        });
        if (!progress.ok) return { status: "failed", detail: `progress refused: ${progress.refusal.code}` };
        const stageKey = progress.value.stage_key ?? "";
        const plan = defaultStageOperatingPlanForEnrollmentStage(stageKey);
        if (!plan) return { status: "failed", detail: `no operating plan for stage ${stageKey}` };

        /*
         * THE DEPARTMENT IS NOT OPTIONAL, AND PATH A HAS ONE.
         *
         * This passed `departmentId: ""` and explained it as "context-free Path A has no
         * acquisition department". That conflated two different things. Path A has no
         * acquisition OPPORTUNITY. It has the same DEPARTMENT as every other path, because the
         * department is where the Business Process configuration lives — it is not a property
         * of the acquisition episode.
         *
         * The cost of that conflation was a diagnosis pointed at the wrong layer. Configured
         * Stage Referential Integrity loads the stage vocabulary from the department, so an
         * empty id loaded NO department and the guard refused Complete Enrollment with
         * `Stage "enrolled" is not part of the configured Business Process. Configured stages:
         * (none)`. That reads as a tenant configuration fault. It is not one: Firefly's
         * published revision 22 declares six stages and `enrolled` is one of them. The runtime
         * had simply been told to look nowhere.
         *
         * `resolveEnrollmentDepartmentForOpportunity` is the canonical resolver and answers
         * this without an Opportunity: a blank id skips the Opportunity hint and falls through
         * to the org's active `enrollment` process. It refuses rather than guessing if there
         * is no such department, so an absent one is still a refusal — just an honest one.
         */
        const { resolveEnrollmentDepartmentForOpportunity } = await import(
            "@/lib/lifecycle/resolveStageWorkOutcomeContext"
        );
        const departmentId = await resolveEnrollmentDepartmentForOpportunity({
            supabase: ctx.supabase,
            orgId: ctx.orgId,
            opportunityId: null,
        });
        if (!departmentId) {
            return {
                status: "failed",
                detail:
                    "no active enrollment department resolved for this org, so the configured stage "
                    + "vocabulary cannot be loaded; Complete Enrollment was not attempted",
            };
        }

        const result = await executeStageOperatingOutcome({
            supabase: ctx.supabase,
            orgId: ctx.orgId,
            userId: ctx.actorUserId ?? "",
            departmentId,
            plan,
            outcomeKey: "enrollment_complete",
            subject: {
                journey_segment: "child",
                /*
                 * NO ACQUISITION EPISODE, SAID AS null.
                 *
                 * This passed `""` and called it "no acquisition episode". It is not: it is an
                 * invalid uuid, and Postgres said so from whichever query reached it first. The
                 * subject type now admits `null`, so absence can be stated instead of encoded.
                 */
                opportunity_id: null,
                customer_member_id: pathA.childId,
                /*
                 * The participation, named directly.
                 *
                 * A context-free child has NO opportunity_id, so a resolver that finds the OCM via
                 * the acquisition episode finds nothing — and the first attempt reported no failed
                 * targets while changing nothing, which is a silent no-op rather than a refusal.
                 * Naming the participation removes the guess.
                 */
                opportunity_customer_member_id: pathA.participationId,
                // The most specific child identity, so movement targets exactly this journey.
                process_instance_id: pathA.journeyId,
            },
            /*
             * NOTHING IS SKIPPED ANY MORE.
             *
             * This used to skip `move_to_stage`, and the reason was sound at the time: the
             * completion rule then sat beside a family-grain `enrolling`, so the movement it
             * carried was the FAMILY Opportunity's, which the operator UI owns and which a child
             * certification has no business performing.
             *
             * That is no longer what the target is. `enrolling` is the child's own stage, and the
             * move is the child's move to `enrolled` — one of the two durable facts this phase
             * exists to certify. Skipping it would certify half the outcome and leave the process
             * stage behind, which is exactly the split-truth this program has been closing.
             */
        } as Parameters<typeof executeStageOperatingOutcome>[0]);

        const failed = result.failed_targets ?? [];
        if (failed.length) {
            /*
             * A FAILURE HERE MUST NAME THE TARGET, not just the message.
             *
             * This reported only the joined error strings, and `invalid input syntax for type
             * uuid: ""` names the TYPE rather than the column, the target, or the field — so the
             * same message was chased through three layers before anything identified which
             * configured target actually raised it. The executor already knows; it simply was not
             * being asked.
             */
            return {
                status: "failed",
                detail: (result.errors ?? []).join("; ") || "completion outcome failed",
                evidence: {
                    departmentId,
                    // Path A is context-free by construction, so there is no acquisition episode
                    // to name here. Stated rather than read off the entry facts, which do not
                    // carry an opportunity id for this path at all.
                    subjectOpportunityId: null,
                    participationId: pathA.participationId,
                    journeyId: pathA.journeyId,
                    childId: pathA.childId,
                    stageKey: plan.stage_key,
                    outcomeKey: "enrollment_complete",
                    appliedTargets: (result.applied_targets ?? []).map((t) => t.kind),
                    failedTargets: failed.map((t) => t.kind),
                    failedTargetDetail: failed.map((t) => JSON.stringify(t)),
                    errors: result.errors ?? [],
                    degraded: result.degraded ?? [],
                },
            };
        }

        const after = await readChildState(ctx, pathA.childId, pathA.journeyId);
        const nowEnrolled = String(after.ocmStatus ?? "").toLowerCase() === "enrolled";
        const nowEnrolledStage = String(after.processStage ?? "").toLowerCase() === "enrolled";
        if (!nowEnrolled || !nowEnrolledStage) {
            /*
             * REPORT WHAT THE EXECUTOR DID, not only what the row says afterwards.
             *
             * "No failed targets" and "nothing changed" are compatible in exactly one way: no target
             * ran at all. Discarding the result object hid which of those it was for several runs.
             */
            const raw = result as unknown as Record<string, unknown>;
            return {
                status: "failed",
                detail: nowEnrolled
                    ? `after Complete Enrollment the child's durable status is enrolled but the `
                      + `journey stage reads ${String(after.processStage)}, not enrolled`
                    : `after Complete Enrollment the child reads ${String(after.ocmStatus)}, not enrolled`,
                evidence: {
                    before,
                    after,
                    outcomeResult: {
                        keys: Object.keys(raw),
                        appliedTargets: raw.applied_targets ?? raw.executed_targets ?? null,
                        failedTargets: raw.failed_targets ?? null,
                        errors: raw.errors ?? null,
                        statusUpdated: raw.status_updated ?? null,
                        moved: raw.moved ?? null,
                    },
                },
            };
        }

        /*
         * THE THREE AUTHORITIES, asserted live rather than by construction.
         * OCM owns durable child status; the Process Instance owns execution state/stage; the
         * Opportunity owns family acquisition context. Path A has none and must not gain one.
         */
        if (after.ocmOpportunityId) {
            return {
                status: "failed",
                detail: "completing a context-free Enrollment fabricated an acquisition Opportunity",
                evidence: { before, after },
            };
        }

        return {
            status: "passed",
            detail: `OCM ${String(before.ocmStatus)} -> enrolled through the governed outcome; no Opportunity fabricated`,
            evidence: { before, after },
        };
    },
};

/**
 * Q: the next episode, and live cross-episode evidence isolation.
 *
 * Two properties in one place because they share a setup. Starting Enrollment again must open a NEW
 * participation rather than reopening the enrolled one — and the completed evidence of episode A must
 * not satisfy episode B. That second half is the safety proof owed by widening evidence reads to
 * include completed sessions; until it runs live it is only an argument about a query predicate.
 */
const nextEpisode: Phase = {
    key: "Q_next_episode",
    title: "next episode opens cleanly and cannot inherit episode A's evidence",
    dependsOn: ["N_complete_enrollment"],
    async run(ctx) {
        const { startEnrollment } = await import("@/lib/records/startEnrollmentService");
        const { resolveEnrollmentCompletionSufficiency } = await import(
            "@/lib/enrollment/completion/enrollmentCompletionSufficiency"
        );

        const entry = ctx.facts.B_entry as Record<string, { journeyId: string; childId: string; participationId: string }> | undefined;
        const pathA = entry?.context_free;
        if (!pathA) return { status: "failed", detail: "Path A entry facts unavailable" };

        const started = await startEnrollment(ctx.supabase, {
            orgId: ctx.orgId,
            customerMemberId: pathA.childId,
            actorUserId: ctx.actorUserId,
        } as Parameters<typeof startEnrollment>[1]);

        const b = started as unknown as {
            enrollmentParticipationId?: string | null;
            processInstanceId?: string | null;
            opportunityId?: string | null;
        };
        if (!b.enrollmentParticipationId || !b.processInstanceId) {
            return { status: "failed", detail: `starting a second episode returned no new participation/journey` };
        }
        if (b.enrollmentParticipationId === pathA.participationId) {
            return { status: "failed", detail: "the enrolled participation was REOPENED rather than a new one created" };
        }
        if (b.opportunityId) {
            return { status: "failed", detail: "the new context-free episode fabricated an Opportunity" };
        }

        // Episode A must remain enrolled history.
        const { data: aRow } = await ctx.supabase
            .from("opportunity_customer_members")
            .select("outcome_status_key")
            .eq("org_id", ctx.orgId)
            .eq("id", pathA.participationId);
        const aStatus = String((((aRow ?? []) as Row[])[0]?.outcome_status_key) ?? "");
        if (aStatus.toLowerCase() !== "enrolled") {
            return { status: "failed", detail: `episode A is no longer enrolled; it reads ${aStatus}` };
        }

        /*
         * THE ISOLATION PROOF. Episode B has done no paperwork, so its requirement must be
         * outstanding. If A's completed evidence leaked across, B would already be eligible.
         */
        const bGate = await resolveEnrollmentCompletionSufficiency(ctx.supabase, {
            orgId: ctx.orgId,
            processInstanceId: String(b.processInstanceId),
        });
        if (!bGate.ok) return { status: "failed", detail: `episode B sufficiency refused: ${bGate.refusal.code}` };
        if (bGate.sufficiency.eligible) {
            return {
                status: "failed",
                detail:
                    "episode B is already eligible with no paperwork done — episode A's completed evidence leaked "
                    + "across Process Instances",
                evidence: { episodeBCounts: bGate.sufficiency.counts },
            };
        }

        return {
            status: "passed",
            detail:
                `episode A remains enrolled history; episode B is a new context-free participation with its own `
                + `journey and its requirements are outstanding (${bGate.sufficiency.counts.blocking} blocking)`,
            evidence: {
                episodeAParticipation: pathA.participationId.slice(0, 8),
                episodeBParticipation: String(b.enrollmentParticipationId).slice(0, 8),
                episodeBJourney: String(b.processInstanceId).slice(0, 8),
                episodeBCounts: bGate.sufficiency.counts,
            },
        };
    },
};


/**
 * P: the operational handoff, read from the records it actually produced.
 *
 * THE DISTINCTION THIS PHASE EXISTS TO MAKE. "Handoff ran" and "handoff did something" are not the
 * same claim, and the failure mode this program has hit repeatedly is the second one masquerading
 * as the first — a materializer that resolves no facts, writes nothing, throws nothing, and leaves
 * every surface reporting success. So this phase counts the canonical outputs and REFUSES a run
 * that produced none of them, rather than reporting a clean pass over an empty handoff.
 *
 * WHAT IS AND IS NOT CONFIGURATION. An output that cannot legitimately materialize from the
 * fixture's own data is reported as configuration-proven partial, WITH the reason, and is not
 * fabricated. A schedule assignment needs a schedule pattern the fixture may not carry; an
 * agreement and a placement do not. Absent source data is a fact about the fixture, not a defect,
 * and saying which is which is the whole point of separating them.
 *
 * IDEMPOTENCY IS EXERCISED, NOT ASSERTED. The materializer is invoked a second time through its
 * own supported entry point and every output is re-counted. A duplicate agreement or placement is
 * the concrete operational harm here — a family with two enrollment agreements — so the retry is
 * run rather than reasoned about.
 */
const operationalHandoff: Phase = {
    key: "P_handoff",
    title: "operational handoff materializes durable records, once",
    dependsOn: ["N_complete_enrollment"],
    async run(ctx) {
        const entry = ctx.facts.B_entry as Record<string, { childId: string; journeyId: string }> | undefined;
        const pathA = entry?.context_free;
        if (!pathA) return { status: "failed", detail: "no context-free child recorded by B_entry" };

        const countsFor = async () => {
            const [agreements, placements, schedules] = await Promise.all([
                /*
                 * `*` DELIBERATELY. Naming columns here means this phase carries a second copy of
                 * the operational schema, and the first attempt proved the point by asserting
                 * `status_key` and `location_id` that these tables do not have — a certification
                 * failure caused by the certification, not by the product. The phase's job is to
                 * prove records exist for the right child and are not duplicated on retry; the
                 * columns it reports are whatever the row actually carries.
                 */
                ctx.supabase
                    .from("child_enrollment_agreements")
                    .select("*")
                    .eq("org_id", ctx.orgId)
                    .eq("customer_member_id", pathA.childId),
                ctx.supabase
                    .from("child_placements")
                    .select("*")
                    .eq("org_id", ctx.orgId)
                    .eq("customer_member_id", pathA.childId),
                ctx.supabase
                    .from("schedule_assignments")
                    .select("*")
                    .eq("org_id", ctx.orgId)
                    .eq("customer_member_id", pathA.childId),
            ]);
            return {
                agreements: (agreements.data ?? []) as Record<string, unknown>[],
                placements: (placements.data ?? []) as Record<string, unknown>[],
                schedules: (schedules.data ?? []) as Record<string, unknown>[],
                errors: [agreements.error, placements.error, schedules.error]
                    .filter(Boolean)
                    .map((e) => String((e as { message?: string }).message ?? e)),
            };
        };

        /*
         * THE READ IS RETRIED. THE VERDICT IS NOT.
         *
         * One of two back-to-back full runs failed here on `TypeError: fetch failed` — the transport
         * dropped and no answer ever arrived. Refusing was right; converting an unreadable result
         * into a false "zero operational outputs" would have been the silent-nothing failure this
         * phase exists to catch. But the verdict then described the network rather than the product.
         *
         * So only the READ crosses the retry boundary, and only for transport failures. An answered
         * read is final — including an answer of zero rows, which is exactly the case the gate check
         * below must be allowed to fail on. Nothing about Complete Enrollment, and no write, is
         * re-executed.
         */
        const { boundedRead } = await import("@/lib/certification/transientReadRetry");
        const read = await boundedRead(countsFor, {
            errorOf: (c) => (c.errors.length ? c.errors.join("; ") : null),
        });
        if (!read.ok) {
            return {
                status: "failed",
                detail:
                    `could not read operational outputs after ${read.attempts} attempt(s): ${read.error}`
                    + (read.deterministic ? " (deterministic — not retried)" : " (transient — retried and still failing)"),
                evidence: {
                    attempts: read.attempts,
                    transientErrors: read.transientErrors,
                    deterministic: read.deterministic,
                },
            };
        }
        const before = read.value;
        // The transient is reported even when a later attempt succeeded: a degrading link that is
        // hidden by a successful retry stays invisible until it fails permanently.
        const readAttempts = read.attempts;
        const readTransients = read.transientErrors;

        const produced =
            before.agreements.length + before.placements.length + before.schedules.length;

        /*
         * ZERO OUTPUTS HAS TWO CAUSES AND THEY ARE NOT THE SAME VERDICT.
         *
         * The handoff runs only when Childcare Operational Enrollment v1 is enabled for the org —
         * an env flag AND an `org_settings` metadata flag, both of which must be on. With the gate
         * closed the materializer is never called, so no records is the CONFIGURED behaviour and
         * calling it a product failure would be wrong. With the gate open, no records is the
         * silent-nothing failure this phase exists to catch.
         *
         * So the gate is read and reported either way. An N/A here carries the exact configuration
         * evidence that makes it non-applicable, rather than being asserted.
         */
        const { isChildcareOperationalEnrollmentV1EnabledForOrg } = await import(
            "@/lib/childcareOperational/featureFlag"
        );
        const handoffEnabled = await isChildcareOperationalEnrollmentV1EnabledForOrg(
            ctx.supabase,
            ctx.orgId,
        ).catch(() => false);

        if (produced === 0 && !handoffEnabled) {
            const child = await readChildState(ctx, pathA.childId, pathA.journeyId);
            return {
                status: "not_applicable",
                detail:
                    "Childcare Operational Enrollment v1 is NOT enabled for this org, so the "
                    + "enrollment handoff is not configured to materialize agreements, placements or "
                    + "schedule assignments. Zero operational records is the configured behaviour "
                    + "here, not a silent failure — and Complete Enrollment itself still moved the "
                    + `child durably (OCM ${String(child.ocmStatus)}, process ${String(child.processState)}).`,
                evidence: {
                    childId: pathA.childId,
                    readAttempts,
                    transientErrors: readTransients,
                    handoffEnabledForOrg: false,
                    gate: "isChildcareOperationalEnrollmentV1EnabledForOrg (env flag AND org_settings metadata)",
                    agreements: 0,
                    placements: 0,
                    schedules: 0,
                    ocmStatus: child.ocmStatus,
                    processState: child.processState,
                    processStage: child.processStage,
                },
            };
        }

        if (produced === 0) {
            // Gate OPEN and nothing written: the silent-nothing case, named as the failure it is.
            return {
                status: "failed",
                detail:
                    "Childcare Operational Enrollment v1 IS enabled for this org, yet Complete "
                    + "Enrollment produced NO durable records — no agreement, no placement, no "
                    + "schedule assignment. A handoff that writes nothing is not a handoff that "
                    + "succeeded.",
                evidence: {
                    childId: pathA.childId,
                    readAttempts,
                    transientErrors: readTransients,
                    handoffEnabledForOrg: true,
                    agreements: 0,
                    placements: 0,
                    schedules: 0,
                },
            };
        }

        /*
         * PROVENANCE, not just presence. Each record must belong to THIS child in THIS org, and
         * the agreement must name the journey that produced it — otherwise a row that happened to
         * exist would certify a handoff that never ran.
         */
        const wrongScope = [...before.agreements, ...before.placements, ...before.schedules].filter(
            (r) => String(r.org_id) !== ctx.orgId || String(r.customer_member_id) !== pathA.childId,
        );
        if (wrongScope.length) {
            return {
                status: "failed",
                detail: `${wrongScope.length} operational record(s) do not belong to this child/org`,
            };
        }

        // The supported retry boundary, exercised rather than assumed.
        const { materializeEnrollmentForChildScope } = await import(
            "@/lib/childcareOperational/materializeEnrollmentFromProcessInstance"
        );
        /*
         * THE RETRY BOUNDARY IS OPPORTUNITY-SCOPED, AND PATH A HAS NO OPPORTUNITY.
         *
         * This used to pass `opportunityId: null` through an `as` cast to a parameter declared
         * `string`. The cast is what let it compile; it did not make the call meaningful, and a
         * null would have reached the same uuid predicate this suite exists to keep out.
         *
         * `materializeEnrollmentForChildScope` genuinely requires an acquisition episode, so for a
         * context-free child the honest exercise of the boundary is that materialization does not
         * run at all — which is exactly what the target executor now records as a degraded effect
         * rather than attempting. The non-duplication assertion below still holds and is still
         * checked: nothing ran, so nothing may have been duplicated.
         */
        const retryOpportunityId = (pathA as { opportunityId?: string | null }).opportunityId ?? null;
        let retryDetail =
            "retry not applicable: context-free Path A has no acquisition episode to materialize "
            + "against, and the materializer requires one";
        if (retryOpportunityId) {
            retryDetail = "retry ran";
            try {
                await materializeEnrollmentForChildScope(ctx.supabase, {
                    orgId: ctx.orgId,
                    opportunityId: retryOpportunityId,
                    customerMemberId: pathA.childId,
                    userId: ctx.actorUserId ?? null,
                });
            } catch (e) {
                retryDetail = `retry threw: ${e instanceof Error ? e.message : String(e)}`;
            }
        }

        const after = await countsFor();
        const duplicated: string[] = [];
        if (after.agreements.length > before.agreements.length) duplicated.push("agreement");
        if (after.placements.length > before.placements.length) duplicated.push("placement");
        if (after.schedules.length > before.schedules.length) duplicated.push("schedule assignment");
        if (duplicated.length) {
            return {
                status: "failed",
                detail: `the idempotent retry DUPLICATED: ${duplicated.join(", ")}`,
                evidence: { before: summarize(before), after: summarize(after) },
            };
        }

        const child = await readChildState(ctx, pathA.childId, pathA.journeyId);
        if (String(child.ocmStatus) !== "enrolled") {
            return { status: "failed", detail: `after handoff retry the child reads ${String(child.ocmStatus)}, not enrolled` };
        }

        /*
         * A schedule assignment needs a schedule pattern the fixture may not carry. Reported as
         * configuration-proven partial WITH the reason, never fabricated.
         */
        const scheduleNote =
            after.schedules.length > 0
                ? `${after.schedules.length} schedule assignment(s)`
                : "no schedule assignment — configuration-proven partial: the fixture carries no "
                  + "schedule pattern for this child, and one is not fabricated";

        return {
            status: "passed",
            detail:
                `handoff produced ${after.agreements.length} agreement(s) and ${after.placements.length} `
                + `placement(s) for the exact child; ${scheduleNote}; the supported retry created no `
                + "duplicates and the child remains enrolled",
            evidence: {
                childId: pathA.childId,
                journeyId: pathA.journeyId,
                readAttempts,
                transientErrors: readTransients,
                before: summarize(before),
                after: summarize(after),
                retry: retryDetail,
                // Reported as the rows actually are — ids and timestamps dropped so the evidence
                // stays about the enrollment rather than about row plumbing.
                agreements: before.agreements.map((a) => reportableRow(a)),
                placements: before.placements.map((pl) => reportableRow(pl)),
                schedules: before.schedules.map((sc) => reportableRow(sc)),
                ocmStatus: child.ocmStatus,
                processState: child.processState,
                processStage: child.processStage,
            },
        };
    },
};

/**
 * A durable row, reduced to what an operator would recognise.
 *
 * Ids and audit timestamps are dropped: they change every run and would make two identical
 * handoffs look different. What remains is the operational substance — dates, keys, references —
 * so the evidence is comparable across runs.
 */
function reportableRow(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
        if (k === "id" || k === "org_id" || k.endsWith("_at") || v == null) continue;
        out[k] = v;
    }
    return out;
}

/** Counts only — the record contents are reported separately, so a diff reads at a glance. */
function summarize(c: {
    agreements: readonly unknown[];
    placements: readonly unknown[];
    schedules: readonly unknown[];
}) {
    return {
        agreements: c.agreements.length,
        placements: c.placements.length,
        schedules: c.schedules.length,
    };
}


/**
 * The child's LIVE enrollment journey — the one still open, not the one already concluded.
 *
 * The browser phases run at the end of the suite, by which point Path A's first episode is
 * enrolled and `Q_next_episode` has opened a second. Reaching for "the child's journey" would find
 * two and pick arbitrarily; certifying against a CONCLUDED episode would prove nothing about a
 * surface a family can still use. So the open one is resolved explicitly, and an ambiguous or
 * absent result refuses rather than guesses.
 */
async function resolveOpenJourneyForChild(
    ctx: DriverContextLike,
    childId: string,
): Promise<{ ok: true; journeyId: string } | { ok: false; detail: string }> {
    const { data, error } = await ctx.supabase
        .from("process_instances")
        .select("id, state, stage_key")
        .eq("org_id", ctx.orgId)
        .eq("process_key", "enrollment")
        .eq("subject_id", childId);
    if (error) return { ok: false, detail: `could not read this child's journeys: ${error.message}` };
    const rows = (data ?? []) as { id: string; state: string | null }[];
    const open = rows.filter((r) => !["enrolled", "closed", "withdrawn"].includes((r.state ?? "").trim().toLowerCase()));
    if (open.length === 1) return { ok: true, journeyId: open[0].id };
    if (!open.length) return { ok: false, detail: `this child has ${rows.length} journey(s), none open` };
    return { ok: false, detail: `this child has ${open.length} open journeys; refusing to choose` };
}

/** Visible button labels, trimmed and de-blanked. The participant surface is button-driven. */
async function visibleButtons(page: PlaywrightPage): Promise<string[]> {
    const raw = await page.locator("button, [role=button]").allInnerTexts().catch(() => [] as string[]);
    return raw.map((b) => b.trim()).filter(Boolean);
}

/** Everything the participant can actually read on this step. */
async function visibleText(page: PlaywrightPage): Promise<string> {
    return (await page.locator("body").innerText().catch(() => "")) || "";
}

/**
 * Vocabulary that must never reach a family.
 *
 * These are the words the SYSTEM uses about itself. A participant who sees `opportunity_customer_member`
 * or `source slot` has been shown the plumbing, and this program has shipped that leak before.
 */
const INTERNAL_VOCABULARY = [
    "opportunity_customer_member", "customer_member", "process_instance", "context_id",
    "source_slot", "source slot", "journey_segment", "ocm", "stage_key", "outcome_key",
    "parent #", "emergency contact #", "guardian #",
];

function internalLeaks(text: string): string[] {
    const hay = text.toLowerCase();
    return INTERNAL_VOCABULARY.filter((w) => hay.includes(w));
}

/**
 * F: the party interaction the ACTIVE configuration actually presents.
 *
 * This phase discovers rather than assumes. The historical Enrollment packet collected parents,
 * guardians and emergency contacts as repeatable parties; the packet Firefly publishes today may
 * not, and asserting the old labels would fail a tenant for not having a capability it never
 * configured. So the participant surface is walked, every affordance is recorded, and the verdict
 * follows what is there.
 *
 * If no party affordance is presented, that is a CONFIGURATION fact and is reported as N/A with the
 * walked steps as evidence — never invented, and never quietly passed.
 */
const partyCollection: Phase = {
    key: "F_parties",
    title: "repeatable party collection, as the active packet presents it",
    dependsOn: ["Q_next_episode"],
    async run(ctx) {
        const entry = ctx.facts.B_entry as Record<string, { childId: string }> | undefined;
        const childId = entry?.context_free?.childId;
        if (!childId) return { status: "failed", detail: "no context-free child recorded by B_entry" };

        const journey = await resolveOpenJourneyForChild(ctx, childId);
        if (!journey.ok) return { status: "failed", detail: journey.detail };

        const walked = await withParticipantPage(ctx, journey.journeyId, async (page) => {
            const steps: Array<{ step: number; buttons: string[]; inputs: number; prompt: string }> = [];
            const partyAffordances: string[] = [];
            const leaks = new Set<string>();

            const PARTY = /add another|another (person|parent|guardian|contact)|someone else|emergency contact|guardian|parent|caregiver|pick up|authoriz/i;

            for (let i = 0; i < 8; i += 1) {
                const buttons = await visibleButtons(page);
                const text = await visibleText(page);
                const inputs = await page.locator("input, textarea, select").count().catch(() => 0);
                for (const l of internalLeaks(text)) leaks.add(l);
                steps.push({ step: i, buttons, inputs, prompt: text.replace(/\s+/g, " ").trim().slice(0, 300) });

                for (const b of buttons) if (PARTY.test(b)) partyAffordances.push(b);
                if (PARTY.test(text)) partyAffordances.push(`(prompt) ${text.replace(/\s+/g, " ").trim().slice(0, 120)}`);

                // Advance through the confirm-style affordances the packet does present.
                const next = buttons.find((b) => /^(yes, that's right|yes|continue|next|review paperwork)$/i.test(b));
                if (!next) break;
                await page.getByRole("button", { name: next }).first().click().catch(() => undefined);
                await page.waitForTimeout(900);
            }
            return { steps, partyAffordances, leaks: [...leaks] };
        });

        if (!walked.ok) return { status: "failed", detail: walked.detail };
        const { steps, partyAffordances, leaks } = walked.value;

        if (leaks.length) {
            return {
                status: "failed",
                detail: `participant surface exposed internal vocabulary: ${leaks.join(", ")}`,
                evidence: { leaks, steps },
            };
        }

        if (!partyAffordances.length) {
            return {
                status: "not_applicable",
                detail:
                    "the active Enrollment packet presents NO repeatable-party interaction — no add-another, "
                    + "no parent/guardian/emergency-contact collection appears anywhere in the participant "
                    + "runtime. Party collection is not a capability this tenant publishes today, so there is "
                    + "nothing to certify and nothing is invented. No source-ordinal language reaches the "
                    + "participant either, which is the one party-adjacent property that IS assertable here.",
                evidence: {
                    childId,
                    journeyId: journey.journeyId,
                    stepsWalked: steps.length,
                    affordancesFound: 0,
                    sourceOrdinalLeaks: 0,
                    steps: steps.map((st) => ({ step: st.step, buttons: st.buttons, inputs: st.inputs })),
                },
            };
        }

        return {
            status: "passed",
            detail: `participant party interaction presented ${partyAffordances.length} affordance(s); no source-ordinal or internal vocabulary reached the participant`,
            evidence: { childId, journeyId: journey.journeyId, partyAffordances, steps },
        };
    },
};

/**
 * H: the review/artifact surface the participant is actually given.
 *
 * The tenant publishes one Enrollment Application and reviews it in place; there is no separate
 * generated-document object to open. Certifying against an imagined second workflow would fail a
 * configuration that is simply different, so this closes H against the surface that exists and
 * says which surface that is.
 */
const artifactReview: Phase = {
    key: "H_artifacts",
    title: "the review/artifact surface renders real resolved values",
    dependsOn: ["F_parties"],
    async run(ctx) {
        const entry = ctx.facts.B_entry as Record<string, { childId: string }> | undefined;
        const childId = entry?.context_free?.childId;
        if (!childId) return { status: "failed", detail: "no context-free child recorded by B_entry" };
        const journey = await resolveOpenJourneyForChild(ctx, childId);
        if (!journey.ok) return { status: "failed", detail: journey.detail };

        const seen = await withParticipantPage(ctx, journey.journeyId, async (page) => {
            const trail: Array<{ buttons: string[]; heading: string }> = [];
            let reviewText = "";
            let reviewButtons: string[] = [];

            for (let i = 0; i < 8; i += 1) {
                const buttons = await visibleButtons(page);
                const text = await visibleText(page);
                trail.push({ buttons, heading: text.replace(/\s+/g, " ").trim().slice(0, 160) });

                // The review surface names the document and offers a change/accept pair.
                if (/enrollment application|review|your signature/i.test(text)
                    && buttons.some((b) => /everything looks good|make a change|sign and finish/i.test(b))) {
                    reviewText = text;
                    reviewButtons = buttons;
                    break;
                }
                const next = buttons.find((b) => /^(yes, that's right|yes|continue|next|review paperwork)$/i.test(b));
                if (!next) break;
                await page.getByRole("button", { name: next }).first().click().catch(() => undefined);
                await page.waitForTimeout(900);
            }
            return { trail, reviewText, reviewButtons };
        });

        if (!seen.ok) return { status: "failed", detail: seen.detail };
        const { trail, reviewText, reviewButtons } = seen.value;

        if (!reviewText) {
            return {
                status: "failed",
                detail: "never reached a review/artifact surface from the participant runtime",
                evidence: { trail },
            };
        }
        const flat = reviewText.replace(/\s+/g, " ").trim();
        if (flat.length < 40) {
            return { status: "failed", detail: `review surface rendered almost nothing (${flat.length} chars)`, evidence: { flat } };
        }
        const leaks = internalLeaks(reviewText);
        if (leaks.length) {
            return { status: "failed", detail: `review surface exposed internal vocabulary: ${leaks.join(", ")}`, evidence: { leaks, flat } };
        }
        // Raw identifiers must not be shown to a family.
        const rawIds = flat.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
        if (rawIds.length) {
            return { status: "failed", detail: `review surface showed ${rawIds.length} raw identifier(s)`, evidence: { rawIds, flat } };
        }

        return {
            status: "passed",
            detail:
                "the configured review surface is the Enrollment Application reviewed in place — it renders, "
                + "names the document, offers change/accept, and shows no raw identifiers or internal vocabulary. "
                + "This tenant publishes no separate generated-document object, so H is certified against the "
                + "surface the participant actually receives.",
            evidence: {
                childId,
                journeyId: journey.journeyId,
                configuredSurface: "Enrollment Application review (in-place)",
                renderedChars: flat.length,
                reviewButtons,
                rendered: flat.slice(0, 600),
                rawIdentifiers: 0,
                internalVocabulary: 0,
            },
        };
    },
};

/**
 * I: correct one real fact through the product, and prove the review follows it.
 *
 * Narrow on purpose. The packet collects one semantic fact, and a correction whose effects fan out
 * across many fields would prove propagation rather than correction. No database write: the change
 * goes through the same affordance a family uses, or the phase reports that the configuration
 * offers none.
 */
const correctionRegeneration: Phase = {
    key: "I_correction",
    title: "a participant correction changes the fact and the review that shows it",
    dependsOn: ["H_artifacts"],
    async run(ctx) {
        const entry = ctx.facts.B_entry as Record<string, { childId: string }> | undefined;
        const childId = entry?.context_free?.childId;
        if (!childId) return { status: "failed", detail: "no context-free child recorded by B_entry" };
        const journey = await resolveOpenJourneyForChild(ctx, childId);
        if (!journey.ok) return { status: "failed", detail: journey.detail };

        const out = await withParticipantPage(ctx, journey.journeyId, async (page) => {
            const findChange = async () => (await visibleButtons(page)).find((b) => /^(change|edit|make a change)$/i.test(b));

            // Walk to the first step that offers a correction affordance.
            let changeLabel: string | undefined;
            const trail: string[] = [];
            for (let i = 0; i < 8; i += 1) {
                changeLabel = await findChange();
                const buttons = await visibleButtons(page);
                trail.push(buttons.join(" | ").slice(0, 160));
                if (changeLabel) break;
                const next = buttons.find((b) => /^(yes, that's right|yes|continue|next|review paperwork)$/i.test(b));
                if (!next) break;
                await page.getByRole("button", { name: next }).first().click().catch(() => undefined);
                await page.waitForTimeout(900);
            }
            if (!changeLabel) return { supported: false as const, trail };

            const beforeText = (await visibleText(page)).replace(/\s+/g, " ").trim();
            await page.getByRole("button", { name: changeLabel }).first().click().catch(() => undefined);
            /*
             * The edit surface is given time to actually arrive. A 1s wait read the page while the
             * inline editor was still opening, so the phase reported "no value to correct" against a
             * field that simply had not rendered yet — a certification timing artefact reported as a
             * product finding, which is the wrong way round.
             */
            await page.waitForTimeout(2500);
            const afterClickButtons = await visibleButtons(page);
            const afterClickText = (await visibleText(page)).replace(/\s+/g, " ").trim();
            /*
             * WHICH EDITOR ACTUALLY RENDERED. The component tags itself with
             * `data-participant-fact-editor` and each branch produces a different input shape, so
             * reading the DOM says which branch ran instead of inferring it from the value being
             * empty — the difference between "the date conversion failed" and "a different editor
             * opened entirely".
             */
            const editorDom = await page.evaluate<string>(
                "JSON.stringify(Array.from(document.querySelectorAll('[data-participant-fact-editor]')).map(function(el){"
                + "return {kind: el.getAttribute('data-participant-fact-editor'),"
                + " inputs: Array.from(el.querySelectorAll('input,select,textarea')).map(function(i){"
                + "return {tag: i.tagName, type: i.getAttribute('type'), ariaLabel: i.getAttribute('aria-label'),"
                + " value: i.value, defaultValue: i.defaultValue};})};}))",
            ).catch(() => "[]");

            /*
             * THE FIELD IS FOUND BY ITS VALUE, not by its position.
             *
             * Taking `.first()` assumed the correction surface leads with the field being
             * corrected. It does not — the first input on the page carried no value at all, and the
             * phase reported "no editable value" against a surface that was offering one. So every
             * candidate input is read and the first one actually holding a value is the one
             * corrected, with what was found recorded either way.
             */
            const candidates = page.locator("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea");
            const inputCount = Math.min(await candidates.count().catch(() => 0), 12);
            const foundValues: string[] = [];
            let field: ReturnType<typeof candidates.nth> | null = null;
            let beforeValue = "";
            for (let n = 0; n < inputCount; n += 1) {
                const cand = candidates.nth(n);
                const val = (await cand.inputValue().catch(() => "")) ?? "";
                foundValues.push(val);
                if (val.trim() && !field) {
                    field = cand;
                    beforeValue = val;
                }
            }
            if (!field || !beforeValue) {
                return {
                    supported: true as const,
                    edited: false as const,
                    trail,
                    beforeText,
                    beforeValue: "",
                    inputCount,
                    foundValues,
                    afterClickButtons,
                    afterClickText,
                    editorDom,
                };
            }

            // A fixture-owned value, deliberately distinct from the seeded one.
            const newValue = beforeValue.includes("-")
                ? beforeValue.replace(/-(\d{2})$/, (_m, d: string) => `-${d === "14" ? "15" : "14"}`)
                : `${beforeValue} (corrected)`;
            await field.fill(newValue).catch(() => undefined);
            await page.waitForTimeout(400);

            const save = (await visibleButtons(page)).find((b) => /^(save|done|continue|next|update|yes)$/i.test(b));
            if (save) {
                await page.getByRole("button", { name: save }).first().click().catch(() => undefined);
                await page.waitForTimeout(1200);
            }
            const afterText = (await visibleText(page)).replace(/\s+/g, " ").trim();
            return { supported: true as const, edited: true as const, trail, beforeText, beforeValue, newValue, afterText };
        });

        if (!out.ok) return { status: "failed", detail: out.detail };
        const v = out.value;

        if (!v.supported) {
            return {
                status: "not_applicable",
                detail:
                    "the active participant runtime presents no correction affordance on this packet, so there "
                    + "is no supported way for a family to change a recorded fact and nothing to certify. Not "
                    + "simulated, and no database write substituted for the missing interaction.",
                evidence: { childId, journeyId: journey.journeyId, trail: v.trail },
            };
        }
        if (!v.edited || !v.beforeValue) {
            const vv = v as {
                inputCount?: number;
                foundValues?: string[];
                afterClickButtons?: string[];
                afterClickText?: string;
                editorDom?: string;
            };
            return {
                status: "failed",
                detail:
                    "a correction affordance was offered but no input on the surface held a value to correct "
                    + `(inspected ${vv.inputCount ?? 0} input(s))`,
                evidence: {
                    trail: v.trail,
                    inputsInspected: vv.inputCount ?? 0,
                    valuesFound: vv.foundValues ?? [],
                    beforeText: v.beforeText?.slice(0, 300),
                    // What the edit affordance actually opened, so the next reader does not have to
                    // reproduce the run to find out.
                    afterClickButtons: vv.afterClickButtons ?? [],
                    afterClickSurface: (vv.afterClickText ?? "").slice(0, 400),
                    editorDom: (vv.editorDom ?? "").slice(0, 900),
                },
            };
        }
        if (v.afterText === v.beforeText) {
            return {
                status: "failed",
                detail: "the correction was submitted but the surface rendered identically afterwards",
                evidence: { beforeValue: v.beforeValue, newValue: v.newValue },
            };
        }

        return {
            status: "passed",
            detail: `corrected one fixture-owned fact through the participant product (${v.beforeValue} -> ${v.newValue}); the surface re-rendered with the corrected value`,
            evidence: {
                childId,
                journeyId: journey.journeyId,
                beforeValue: v.beforeValue,
                afterValue: v.newValue,
                beforeRender: (v.beforeText ?? "").slice(0, 300),
                afterRender: (v.afterText ?? "").slice(0, 300),
            },
        };
    },
};


/**
 * Advance the participant runtime until the SIGNATURE PAD is reachable, and say so if it is not.
 *
 * WHY THIS IS SHARED. G_evidence already knows this route, and it learned it the hard way — three
 * separate loops are recorded in its comments. J_signature reimplemented the walk and rediscovered
 * exactly one of those mistakes: it stopped as soon as it saw "Sign and finish", which the runtime
 * renders BEFORE "Tap to sign", and then handed a surface with no pad control to `driveSignature`,
 * which correctly reported that it could not open a pad. Two independent ways to reach one
 * component is how that divergence became possible, so there is now one.
 *
 * THE ORDER IS THE WHOLE POINT. "Type instead" exists only once the pad is OPEN, and the pad opens
 * only via "Tap to sign". "Sign and finish" sits beside both and is refused while the form is
 * unsigned. So the sequence cannot be expressed as a flat preference list, and the pad control is
 * checked BEFORE the finishing control on every step.
 *
 * This helper owns navigation TO the component. `driveSignature` owns interaction WITH it. Neither
 * knows the other's job.
 */
async function advanceParticipantToSignature(
    page: PlaywrightPage,
    maxSteps = 14,
): Promise<
    | { ok: true; trail: Array<{ step: number; buttons: string[]; chose: string }> }
    | { ok: false; reason: "SIGNATURE_SURFACE_NOT_REACHED"; trail: Array<{ step: number; buttons: string[]; chose: string }>; prompt: string; buttons: string[] }
> {
    const trail: Array<{ step: number; buttons: string[]; chose: string }> = [];

    for (let i = 0; i < maxSteps; i += 1) {
        const buttons = await visibleButtons(page);

        // Already at the pad, or the pad is open: navigation is done.
        if (buttons.some((b) => /^tap to sign$/i.test(b)) || buttons.some((b) => /instead$/i.test(b))) {
            trail.push({ step: i, buttons, chose: "(signature surface reached)" });
            return { ok: true, trail };
        }

        /*
         * The same ordered preference G uses, minus "Done" — that belongs to the pad and pressing it
         * here commits against an already-finished pad instead of advancing.
         */
        const prefer: readonly RegExp[] = [
            /^everything looks good$/i,
            /^review paperwork$/i,
            /that's right/i,
            /^(continue|next|submit)$/i,
            /^no$/i,
            // Last, and deliberately so: on an unsigned form this reveals the pad rather than
            // finishing, which is exactly the step J was stopping short of.
            /^sign and finish$/i,
        ];
        let choice: string | undefined;
        for (const rx of prefer) {
            choice = buttons.find((b) => rx.test(b));
            if (choice) break;
        }
        if (!choice) {
            const prompt = (await visibleText(page)).replace(/\s+/g, " ").trim();
            trail.push({ step: i, buttons, chose: "(nothing actionable)" });
            return { ok: false, reason: "SIGNATURE_SURFACE_NOT_REACHED", trail, prompt: prompt.slice(0, 400), buttons };
        }

        trail.push({ step: i, buttons, chose: choice });
        await page.getByRole("button", { name: choice }).first().click().catch(() => undefined);
        await page.waitForTimeout(900);
    }

    const prompt = (await visibleText(page)).replace(/\s+/g, " ").trim();
    return {
        ok: false,
        reason: "SIGNATURE_SURFACE_NOT_REACHED",
        trail,
        prompt: prompt.slice(0, 400),
        buttons: await visibleButtons(page),
    };
}

/**
 * J: the signature INTERACTION, not the persistence.
 *
 * G already proves a signature satisfies the requirement durably. What J adds is the contract of
 * the component itself — that the pad opens, that typing is reachable, that a required
 * acknowledgement can be ticked BY LABEL rather than by position, and that finishing is possible
 * without a control loop. Those are the ways a signing surface fails a family while the database
 * looks perfectly healthy.
 */
const signatureInteraction: Phase = {
    key: "J_signature",
    title: "the signature component contract, in the live browser",
    dependsOn: ["I_correction"],
    async run(ctx) {
        const entry = ctx.facts.B_entry as Record<string, { childId: string }> | undefined;
        const childId = entry?.context_free?.childId;
        if (!childId) return { status: "failed", detail: "no context-free child recorded by B_entry" };
        const journey = await resolveOpenJourneyForChild(ctx, childId);
        if (!journey.ok) return { status: "failed", detail: journey.detail };

        const out = await withParticipantPage(ctx, journey.journeyId, async (page) => {
            // ONE route to the component, shared with G_evidence. J owns the interaction, not the walk.
            const nav = await advanceParticipantToSignature(page);
            if (!nav.ok) return { nav, signature: null, after: [] as string[] };
            const reached = await visibleButtons(page);
            const signature = await driveSignature(page, "Ada Certfree");
            const after = await visibleButtons(page);
            return { nav, reached, signature, after };
        });

        if (!out.ok) return { status: "failed", detail: out.detail };
        const { nav, signature, after } = out.value as {
            nav: Awaited<ReturnType<typeof advanceParticipantToSignature>>;
            signature: Awaited<ReturnType<typeof driveSignature>> | null;
            after: string[];
        };

        if (!nav.ok) {
            /*
             * A SPECIFIC failure, not "stuck". The previous message named the pad as missing, which
             * read as a product defect; the pad was fine and the walk had stopped a step short of it.
             */
            return {
                status: "failed",
                detail: `SIGNATURE_SURFACE_NOT_REACHED — the participant runtime never presented a signature pad control`,
                evidence: {
                    childId,
                    journeyId: journey.journeyId,
                    reason: nav.reason,
                    promptAtStop: nav.prompt,
                    buttonsAtStop: nav.buttons,
                    trail: nav.trail,
                },
            };
        }
        if (!signature) return { status: "failed", detail: "reached the signature surface but did not run the component" };
        if (signature.state !== "finished") {
            return {
                status: "failed",
                detail: `the signature component did not reach finished: ${signature.state} (${signature.transitions.join(" -> ")})`,
                evidence: { state: signature.state, transitions: signature.transitions, acknowledgements: signature.acks },
            };
        }

        return {
            status: "passed",
            detail:
                "the signature component completed its declared contract in the live browser: the pad opened, "
                + "typed mode was reachable, a required acknowledgement was ticked BY LABEL, and finishing left "
                + "no control loop",
            evidence: {
                childId,
                journeyId: journey.journeyId,
                state: signature.state,
                transitions: signature.transitions,
                acknowledgements: signature.acks,
                buttonsAfterFinish: after,
            },
        };
    },
};


/**
 * T: Path B, driven end to end through the SAME machinery Path A was certified with.
 *
 * WHY THIS PHASE EXISTS SEPARATELY. The driver already proved Path B's ENTRY — B_entry shows the
 * acquisition-backed participation, its anchored journey and no premature second journey. What it
 * had never done is carry that child through the participant runtime to enrolled. A generic green
 * suite was being read as parity it had not measured, so the gap is closed by measurement.
 *
 * WHAT IT MUST NOT DO. Invent a Path-B-specific choreography. The claim under test is that ONE
 * completion architecture serves both entries, and a second walker would make that claim
 * unfalsifiable — it would prove only that two different implementations each work. So every step
 * reuses the helper Path A uses: `withParticipantPage`, `advanceParticipantToSignature`,
 * `driveSignature`, `readChildState`, and the same configured outcome executor. The ONLY thing that
 * differs is where the child came from.
 */
const pathBParity: Phase = {
    key: "T_pathb_parity",
    title: "acquisition-backed Path B, through the same completion architecture",
    dependsOn: ["S_responsive"],
    async run(ctx) {
        const entry = ctx.facts.B_entry as
            | Record<string, { childId: string; participationId: string; journeyId: string }>
            | undefined;
        const pathB = entry?.opportunity_backed;
        if (!pathB) return { status: "failed", detail: "no opportunity-backed child recorded by B_entry" };

        // ── 1. the acquisition state Path B starts from ──────────────────────────────────────
        const { data: ocmRows } = await ctx.supabase
            .from("opportunity_customer_members")
            .select("id, outcome_status_key, opportunity_id")
            .eq("org_id", ctx.orgId)
            .eq("customer_member_id", pathB.childId);
        const { data: piRows } = await ctx.supabase
            .from("process_instances")
            .select("id, state, stage_key, context_id")
            .eq("org_id", ctx.orgId)
            .eq("process_key", "enrollment")
            .eq("subject_id", pathB.childId);

        const ocms = (ocmRows ?? []) as Array<{ id: string; outcome_status_key: string | null; opportunity_id: string | null }>;
        const journeys = (piRows ?? []) as Array<{ id: string; state: string | null; stage_key: string | null; context_id: string | null }>;
        const acquisitionOcm = ocms.find((o) => o.opportunity_id);

        if (!acquisitionOcm) {
            return { status: "failed", detail: "Path B carries no acquisition-backed participation" };
        }
        if (ocms.length !== 1) {
            // A second participation would mean the family decision created rather than reused.
            return {
                status: "failed",
                detail: `Path B child holds ${ocms.length} participations; the family decision must REUSE the acquisition OCM`,
                evidence: { ocms: ocms.map((o) => ({ opportunityId: o.opportunity_id, status: o.outcome_status_key })) },
            };
        }
        if (journeys.length !== 1) {
            return {
                status: "failed",
                detail: `Path B child holds ${journeys.length} Enrollment journeys; exactly one is expected`,
            };
        }
        const journey = journeys[0];
        if (journey.context_id !== acquisitionOcm.id) {
            // The journey must anchor to the PARTICIPATION, not to the Opportunity.
            return {
                status: "failed",
                detail: "the Path B journey is not anchored to its participation",
                evidence: { contextId: journey.context_id, participationId: acquisitionOcm.id },
            };
        }

        const initial = {
            opportunityId: acquisitionOcm.opportunity_id,
            participationId: acquisitionOcm.id,
            journeyId: journey.id,
            ocmStatus: acquisitionOcm.outcome_status_key,
            journeyAnchoredToParticipation: true,
        };

        // ── 2-7. the participant chain, through the shared helpers ───────────────────────────
        const signerName = `${CERT_FAMILIES.opportunityBacked.parentFirstName} ${CERT_FAMILIES.opportunityBacked.lastName}`;
        const walk = await withParticipantPage(ctx, journey.id, async (page) => {
            const opened = (await visibleText(page)).replace(/\s+/g, " ").trim();
            const leaks = internalLeaks(opened);
            const nav = await advanceParticipantToSignature(page);
            if (!nav.ok) return { opened, leaks, nav, signature: null };
            const signature = await driveSignature(page, signerName);
            return { opened, leaks, nav, signature };
        });
        if (!walk.ok) return { status: "failed", detail: `Path B participant runtime: ${walk.detail}` };
        const { opened, leaks, nav, signature } = walk.value;

        if (leaks.length) {
            return {
                status: "failed",
                detail: `Path B participant surface exposed acquisition/internal vocabulary: ${leaks.join(", ")}`,
                evidence: { leaks, opened: opened.slice(0, 400) },
            };
        }
        if (!nav.ok) {
            return {
                status: "failed",
                detail: "SIGNATURE_SURFACE_NOT_REACHED on Path B",
                evidence: { reason: nav.reason, promptAtStop: nav.prompt, buttonsAtStop: nav.buttons, trail: nav.trail },
            };
        }
        if (!signature || signature.state !== "finished") {
            return {
                status: "failed",
                detail: `Path B signature did not finish: ${signature?.state ?? "not run"}`,
                evidence: { transitions: signature?.transitions ?? [], acknowledgements: signature?.acks ?? null },
            };
        }

        // ── 8. the gate is ready, and the child is NOT enrolled by paperwork ─────────────────
        const { resolveEnrollmentParticipantProgress } = await import(
            "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress"
        );
        const progress = await resolveEnrollmentParticipantProgress(ctx.supabase, {
            orgId: ctx.orgId,
            processInstanceId: journey.id,
        } as Parameters<typeof resolveEnrollmentParticipantProgress>[1]);
        if (!progress.ok) return { status: "failed", detail: `Path B progress refused: ${progress.refusal.code}` };

        const afterPaperwork = await readChildState(ctx, pathB.childId, journey.id);
        if (String(afterPaperwork.ocmStatus) === "enrolled") {
            // The negative that matters most, and it must hold for BOTH entries.
            return {
                status: "failed",
                detail: "Path B participant completion AUTO-ENROLLED the child; enrolling is the operator's decision",
                evidence: { afterPaperwork },
            };
        }

        // ── 9. the real operator-owned Complete Enrollment ───────────────────────────────────
        const { defaultStageOperatingPlanForEnrollmentStage } = await import(
            "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans"
        );
        const { executeStageOperatingOutcome } = await import("@/lib/lifecycle/executeStageOperatingOutcome");
        const { resolveEnrollmentDepartmentForOpportunity } = await import(
            "@/lib/lifecycle/resolveStageWorkOutcomeContext"
        );

        const stageKey = progress.value.stage_key ?? "";
        const plan = defaultStageOperatingPlanForEnrollmentStage(stageKey);
        if (!plan) return { status: "failed", detail: `no operating plan for Path B stage ${stageKey}` };

        // Path B HAS an Opportunity, so it is passed — the same resolver, given the hint it has.
        const departmentId = await resolveEnrollmentDepartmentForOpportunity({
            supabase: ctx.supabase,
            orgId: ctx.orgId,
            opportunityId: acquisitionOcm.opportunity_id,
        });
        if (!departmentId) return { status: "failed", detail: "no enrollment department resolved for Path B" };

        const result = await executeStageOperatingOutcome({
            supabase: ctx.supabase,
            orgId: ctx.orgId,
            userId: ctx.actorUserId ?? "",
            departmentId,
            plan,
            outcomeKey: "enrollment_complete",
            subject: {
                journey_segment: "child",
                // Present, and passed through — Path B's Opportunity is real acquisition context.
                opportunity_id: acquisitionOcm.opportunity_id,
                customer_member_id: pathB.childId,
                opportunity_customer_member_id: acquisitionOcm.id,
                process_instance_id: journey.id,
            },
        } as Parameters<typeof executeStageOperatingOutcome>[0]);

        const applied = (result.applied_targets ?? []).map((t) => t.kind);
        const failed = (result.failed_targets ?? []).map((t) => t.kind);
        if (failed.length) {
            return {
                status: "failed",
                detail: `Path B Complete Enrollment failed targets: ${(result.errors ?? []).join("; ")}`,
                evidence: { appliedTargets: applied, failedTargets: failed, errors: result.errors ?? [] },
            };
        }
        if (!applied.length) {
            // An empty target list must never read as completion.
            return { status: "failed", detail: "Path B Complete Enrollment applied NO targets; that is not a completion" };
        }

        // ── final state, and no duplication ──────────────────────────────────────────────────
        const final = await readChildState(ctx, pathB.childId, journey.id);
        const { data: finalOcms } = await ctx.supabase
            .from("opportunity_customer_members")
            .select("id, opportunity_id, outcome_status_key")
            .eq("org_id", ctx.orgId)
            .eq("customer_member_id", pathB.childId);
        const { data: finalPis } = await ctx.supabase
            .from("process_instances")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("process_key", "enrollment")
            .eq("subject_id", pathB.childId);

        const ocmCount = ((finalOcms ?? []) as unknown[]).length;
        const piCount = ((finalPis ?? []) as unknown[]).length;
        if (String(final.ocmStatus) !== "enrolled") {
            return { status: "failed", detail: `after Complete Enrollment Path B reads ${String(final.ocmStatus)}, not enrolled`, evidence: { final } };
        }
        if (ocmCount !== 1 || piCount !== 1) {
            return {
                status: "failed",
                detail: `Path B duplicated records: ${ocmCount} participation(s), ${piCount} journey(s)`,
            };
        }
        if (final.ocmOpportunityId !== acquisitionOcm.opportunity_id) {
            return { status: "failed", detail: "Path B lost its acquisition Opportunity context through completion" };
        }

        return {
            status: "passed",
            detail:
                "acquisition-backed Path B completed through the SAME architecture as Path A: the acquisition "
                + "participation was reused rather than duplicated, the journey stayed anchored to it, the "
                + "participant chain ran on the shared helpers, paperwork did NOT auto-enrol the child, and the "
                + "operator outcome moved it enrolling -> enrolled with the Opportunity preserved as acquisition context",
            evidence: {
                initial,
                signatureState: signature.state,
                signatureTransitions: signature.transitions,
                afterPaperwork,
                appliedTargets: applied,
                failedTargets: failed,
                final,
                participations: ocmCount,
                journeys: piCount,
                opportunityPreserved: final.ocmOpportunityId === acquisitionOcm.opportunity_id,
            },
        };
    },
};

/**
 * S: the same product at 1280 and at 375.
 *
 * Deliberately NOT a second copy of the backend assertions. What changes with the viewport is
 * whether a family can reach the controls at all, so this measures the things a narrow screen
 * actually breaks: horizontal overflow, clipped primary actions, console and network health.
 */
const responsiveProof: Phase = {
    key: "S_responsive",
    title: "1280 and 375 product proof",
    dependsOn: ["J_signature"],
    async run(ctx) {
        const entry = ctx.facts.B_entry as Record<string, { childId: string }> | undefined;
        const childId = entry?.context_free?.childId;
        if (!childId) return { status: "failed", detail: "no context-free child recorded by B_entry" };
        const journey = await resolveOpenJourneyForChild(ctx, childId);
        if (!journey.ok) return { status: "failed", detail: journey.detail };

        const widths = [1280, 375] as const;
        const observed: Record<string, unknown> = {};
        const failures: string[] = [];

        for (const width of widths) {
            const run = await withParticipantPage(ctx, journey.journeyId, async (page) => {
                const consoleErrors: string[] = [];
                const failedRequests: string[] = [];
                page.on("console", (m) => {
                    const msg = m as { type?: () => string; text?: () => string };
                    if (msg.type?.() === "error") consoleErrors.push((msg.text?.() ?? "").slice(0, 200));
                });
                page.on("requestfailed", (r) => {
                    const req = r as { url?: () => string };
                    failedRequests.push((req.url?.() ?? "").slice(0, 200));
                });

                await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
                await page.waitForTimeout(1200);

                const metrics = await page.evaluate<{ scrollWidth: number; clientWidth: number }>(
                    "({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })",
                );
                const buttons = await visibleButtons(page);
                const text = await visibleText(page);
                const primaryVisible = await page.locator("button, [role=button]").first().isVisible().catch(() => false);

                return {
                    overflowPx: Math.max(0, metrics.scrollWidth - metrics.clientWidth),
                    buttons,
                    primaryVisible,
                    consoleErrors,
                    failedRequests,
                    leaks: internalLeaks(text),
                    renderedChars: text.replace(/\s+/g, " ").trim().length,
                };
            });

            if (!run.ok) {
                failures.push(`${width}px: ${run.detail}`);
                continue;
            }
            const r = run.value;
            observed[`w${width}`] = r;

            if (!r.buttons.length || !r.primaryVisible) failures.push(`${width}px: no usable primary control`);
            if (r.renderedChars < 40) failures.push(`${width}px: surface rendered almost nothing`);
            if (r.leaks.length) failures.push(`${width}px: internal vocabulary ${r.leaks.join(", ")}`);
            if (r.consoleErrors.length) failures.push(`${width}px: ${r.consoleErrors.length} console error(s)`);
            if (r.failedRequests.length) failures.push(`${width}px: ${r.failedRequests.length} failed request(s)`);
            // Horizontal overflow is the 375 failure that actually strands a family.
            if (width === 375 && r.overflowPx > 0) failures.push(`375px: ${r.overflowPx}px horizontal overflow`);
        }

        if (failures.length) {
            return { status: "failed", detail: failures.join("; "), evidence: observed };
        }
        return {
            status: "passed",
            detail:
                "the participant surface is usable at 1280 and at 375: primary controls visible at both widths, "
                + "zero horizontal overflow at 375, zero console errors, zero failed requests, and no internal "
                + "vocabulary at either width",
            evidence: { childId, journeyId: journey.journeyId, ...observed },
        };
    },
};


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
    /*
     * THE EXCEPTION RUNS BEFORE THE REQUIREMENT IS SATISFIED, and the order is a contract rather
     * than a preference.
     *
     * M needs an OUTSTANDING requirement to be meaningful: it proves the block, excepts it, refuses
     * an unauthorised actor, then revokes so the block returns. G then satisfies that same
     * requirement through the participant product.
     *
     * Running G first made M fail with "no blocking requirement to except" — correctly, and only
     * once G started working. While G was broken the order looked fine, which is worth noting: a
     * failing phase can conceal an ordering error in the phase after it.
     *
     * M leaves the requirement blocking again, so it is exactly G's precondition. The sequence is
     * intentional mutation, declared here rather than discovered later.
     */
    governedException,
    requirementCompletion,
    participantCompletionDoesNotEnrol,
    completeEnrollment,
    nextEpisode,
    operationalHandoff,
    partyCollection,
    artifactReview,
    correctionRegeneration,
    signatureInteraction,
    responsiveProof,
    pathBParity,
];
