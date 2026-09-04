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
        first(): { click(opts?: unknown): Promise<void>; innerText(): Promise<string>; fill(v: string): Promise<void> };
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

        const result = await executeStageOperatingOutcome({
            supabase: ctx.supabase,
            orgId: ctx.orgId,
            userId: ctx.actorUserId ?? "",
            // Context-free Path A has no acquisition department; the executor types this as a
            // string, so the absence is expressed as empty rather than smuggled through as null.
            departmentId: "",
            plan,
            outcomeKey: "enrollment_complete",
            subject: {
                journey_segment: "child",
                // Required by the subject type even for a context-free child; empty says "no
                // acquisition episode" rather than pointing at one that does not exist.
                opportunity_id: "",
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
            // The family stage move belongs to the operator UI; the child effect is what is certified.
            skipTargetKinds: ["move_to_stage"],
        } as Parameters<typeof executeStageOperatingOutcome>[0]);

        const failed = result.failed_targets ?? [];
        if (failed.length) {
            return { status: "failed", detail: (result.errors ?? []).join("; ") || "completion outcome failed" };
        }

        const after = await readChildState(ctx, pathA.childId, pathA.journeyId);
        const nowEnrolled = String(after.ocmStatus ?? "").toLowerCase() === "enrolled";
        if (!nowEnrolled) {
            return {
                status: "failed",
                detail: `after Complete Enrollment the child reads ${String(after.ocmStatus)}, not enrolled`,
                evidence: { before, after },
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
 * Phases that need the participant browser surface. Declared, ordered and explicitly unimplemented
 * so the report shows the shape of what remains rather than hiding it.
 */
const browserPhases: readonly Phase[] = (
    [
        ["F_parties", "repeatable parties"],
        ["H_artifacts", "artifact generation"],
        ["I_correction", "review and correction"],
        ["J_signature", "signatures"],
        ["P_handoff", "operational handoff"],
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
    ...browserPhases,
];
