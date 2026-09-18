/**
 * REGISTERED ACTION FOR ADD CHARGE — one operator intent, no new financial rules.
 *
 * Every rule already exists in `lib/financials/chargeLifecycle`: template resolution, amount
 * strategy, `occurs_on` / `billable_on` derivation, the posting-review policy, GL mapping keys,
 * default responsibility, and idempotency by resolution key. This adapter adds exactly two things the
 * domain deliberately does not have — an operator-facing SUBJECT (a child, not an enrollment
 * agreement) and an operator-facing INTENT — and delegates everything else.
 *
 * ── APPLIES TO ≠ CHARGE TO ──
 *
 * `Applies to` is the FINANCIAL SUBJECT: the operator picks a child, and the agreement id is resolved
 * internally and never exposed. `Charge to` is payer responsibility, and it is NOT a control here:
 * `resolveChargeResponsibility` returns a single default party (the household account, falling back to
 * the child), with no splits and no payer-to-method relationship. Rendering a chooser over a resolver
 * that has exactly one answer would invent an allocation model Financials does not own — Processing
 * does — so the canonical default is used and the control is omitted.
 *
 * ── FUTURE DATING IS THE TEMPLATE'S, NOT THE FORM'S ──
 *
 * A charge that belongs to a later billing context is produced by `billable_on_strategy`
 * (`immediate` | `offset_days` | `next_billing_cycle`), and a draft whose `billable_on` has not
 * arrived IS "scheduled" — derived, with no new status and no extra date column. The operator supplies
 * the event date; the template decides when it becomes billable. An `event_date` input is accepted
 * only because `occurs_on_strategy = 'event_date'` templates genuinely require one.
 *
 * ── PREVIEW IS AUTHORITATIVE ──
 *
 * `previewTemplateCharge` writes nothing and returns the same intent the write would use, so the
 * preview cannot drift from the commit. Balance impact is composed from the read model rather than
 * arithmetic performed here.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import {
    previewTemplateCharge,
    writeTemplateDraftCharge,
} from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import {
    createChildcareCorrection,
    postChildcareCharge,
    type CorrectionKind,
} from "@/lib/financials/childcareChargeService";
import { isPostedStatus } from "@/lib/financials/billableSource";
import { listChargeTemplates } from "@/lib/financials/chargeTemplates/chargeTemplateAuthoringService";
import { subjectGrainIsLegal } from "@/lib/financials/chargeCategorySemantics";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CHARGE_ADD_ACTION_KEY = "charge.add";
export const CHARGE_POST_ACTION_KEY = "charge.post";
export const CHARGE_REVERSE_ACTION_KEY = "charge.reverse";

/**
 * ── WHO MAY MOVE THIS MONEY ──
 *
 * Until now: anybody the portal admitted. `/api/admin/actions/execute` gates on `requireAdminOrOps`,
 * which resolves ADMISSION and nothing else — it does not read a role and it does not read a grant —
 * and none of these three actions checked a capability of its own. So an organization that set a
 * role to "view Financials only" had said something the server did not honour: the same principal
 * could still create a charge, post it, and reverse it. Every neighbouring financial action already
 * enforced (`fin.write` for discounts, `fin.adjust` for hand reductions, `fin.responsibility`,
 * `fin.subsidy`); the charge lifecycle was the hole in the middle of them.
 *
 * **Creating and posting are billing.** `charge.add` writes a draft from a configured template and
 * `charge.post` makes it owed. Both are running the billing machine over authored configuration,
 * which is what `fin.write` names, and it is the same key `billing.apply_discounts` uses for the
 * same reason.
 *
 * **Reversing is not.** A posted charge is immutable, so a correction writes a new line that moves
 * the balance — deciding by hand that a family owes something other than what was billed.
 * `financialReductionActions` already settled that this is a different act and minted `fin.adjust`
 * for it: *"otherwise everyone who can bill can also forgive, and nothing in the record tells them
 * apart."* A reversal forgives a whole charge. Filing it under `fin.write` would hand every biller
 * the stronger authority through the one door that had no lock on it.
 *
 * This is a NARROWING, and a deliberate one. `admin` and `ops` hold both keys by default, so no
 * seeded role loses anything; what changes is that a role configured without them is now refused by
 * the server rather than only by the screen.
 */
export const CHARGE_WRITE_PERMISSION = "fin.write" as const;
/** Correcting posted money is the same authority as reducing it by hand. */
export const CHARGE_CORRECTION_PERMISSION = "fin.adjust" as const;

/**
 * Whether the caller holds `key` in this org.
 *
 * A grant read that FAILED answers `null` and denies here, exactly as it does everywhere else this
 * resolver is used: an unidentified caller is not an unprivileged one, and treating the two alike is
 * how a broken lookup becomes an open door.
 */
async function permitted(
    supabase: SupabaseClient,
    orgId: string,
    userId: string | null | undefined,
    key: string,
): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(key);
}

/** The refusal shape the financial actions already use — a 403 with a machine-readable blocker. */
function denied(correlationId: string, sentence: string, key: string, code: string): ActionResult {
    return {
        ok: false,
        correlationId,
        status: 403,
        error: `${sentence} requires ${key}.`,
        blockers: [{ code, message: "Permission required." }],
    };
}

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/**
 * AN OPPORTUNITY IS NOT A CHILD, so its id must never be read as one.
 *
 * The invocation's entity id is a child only when the invocation's GRAIN says it is. This is every
 * grain `charge.add` accepts except `opportunity`, which names a case rather than a person.
 */
const CHILD_GRAIN_ENTITY_TYPES: ReadonlySet<string> = new Set([
    "child",
    "opportunity_customer_member",
    "person",
]);

/**
 * The child this charge NAMES — and an empty string is a real answer, meaning "no child named".
 *
 * The entity id used to be adopted unconditionally. That was harmless while every caller invoked at
 * child grain, and wrong the moment one did not: a pre-enrolment family has no agreement and so no
 * child subject the card can offer, and its only canonical identity is the panel's own opportunity.
 * Adopting that id turned the household case into a `customer_member_id` lookup against a table it
 * can never match — `resolveChargeSubject` would still reach its household fallback, but by
 * accident, having been asked a question about a child that does not exist.
 *
 * Nothing changes for the grains that were already child-grain; an opportunity id matched no
 * agreement before this and matches none now. What changes is that the resolver is now ASKED the
 * household question instead of arriving at it.
 */
function childIdFrom(
    payload: Record<string, unknown> | undefined,
    entityId: string | undefined,
    entityType?: string | undefined,
): string {
    const named = t(payload?.customer_member_id) || t(payload?.child_id);
    if (named) return named;
    return CHILD_GRAIN_ENTITY_TYPES.has(t(entityType)) ? t(entityId) : "";
}

/**
 * ── THE CHILDREN THIS OPERATION NAMES ────────────────────────────────────────────────────────
 *
 * MULTIPLE CHILDREN IS AN OPERATION, NOT A GRAIN. Selecting Wrigley and Lennon for a $40 field trip
 * creates TWO independent $40 child-attributed obligations — never one $80 household charge, never
 * one row carrying two subject ids, and never one $40 charge shared between them. The stored world
 * is exactly what it was; only the operator's gesture got wider.
 *
 * `customer_member_ids` is the plural form. The singular `customer_member_id` still works and still
 * means the same thing, because every existing caller sends it and a surface that had to be
 * upgraded to keep working would be a breaking change dressed as a feature.
 *
 * DE-DUPLICATED AND ORDER-PRESERVING: the same child named twice is one obligation, not two. An
 * operator double-clicking a checkbox must not be able to bill a family twice, and the selection is
 * the last place that is cheap to guarantee.
 */
function childIdsFrom(
    payload: Record<string, unknown> | undefined,
    entityId: string | undefined,
    entityType?: string | undefined,
): string[] {
    /*
     * ── "DIDN'T SAY" IS NOT "SAID HOUSEHOLD" ─────────────────────────────────────────────────
     *
     * `childIdFrom` falls back to the invocation entity, which is right for a caller acting FROM a
     * child's record and says nothing about grain. But a surface where the operator deliberately
     * chose Household has said something, and it was being overruled: the payload named no child,
     * the entity was still the panel's child for ROUTING, and the charge came back attributed to
     * that child. Measured: "Applies to · Household" produced a Certb-grain registration fee.
     *
     * `subjectMemberId: null` IS household grain rather than missing data — that is the doctrine
     * the whole subject model rests on — so a caller needs a way to state it. Omitting the field
     * cannot mean it, because omitting is exactly what a caller that has no opinion does.
     */
    if (t(payload?.subject_grain) === "household") return [];
    const raw = payload?.customer_member_ids;
    const many = Array.isArray(raw) ? raw.map((v) => t(v)).filter(Boolean) : [];
    if (many.length) return [...new Set(many)];
    const one = childIdFrom(payload, entityId, entityType);
    return one ? [one] : [];
}

function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * The child's billable source.
 *
 * `Applies to` names a CHILD; charges hang off an agreement. Resolving here is what keeps agreement
 * ids out of the operator surface entirely — and a child with no agreement fails closed rather than
 * having a charge attached to whatever agreement happens to exist.
 */
/**
 * WHAT THIS CHARGE IS WRITTEN AGAINST — an agreement when one exists, the household otherwise.
 *
 * ── THE PRODUCT RULE ──
 *
 * A family can be billed before enrollment. A waitlist fee, a registration or application fee and a
 * deposit are all incurred before anyone is enrolled, so requiring an enrollment agreement made
 * Financials enrollment-gated and answered "there is nothing to charge against" to a family that
 * plainly owed money.
 *
 * ── WHAT IS PRESERVED ──
 *
 * AGREEMENT-BACKED CHILD ATTRIBUTION. When the named child HAS an agreement, that agreement is
 * still the source, so an enrolled child's charges keep landing on their own ledger exactly as
 * before. The household source is the fallback, never the preference.
 *
 * HOUSEHOLD CHARGES STAY HOUSEHOLD TRUTH. A charge resolved to the customer is attributed to the
 * customer — it is never pinned onto whichever child happens to be first, which would put a family
 * expense on one sibling's ledger and is the failure this resolver exists to prevent.
 *
 * TEMPLATE AUTHORITY. Whether a PARTICULAR charge needs a child or an agreement is decided by its
 * template and by `resolveChargeFromTemplate` — a rate-derived tuition charge that cannot price
 * itself without an agreement still refuses, and nothing here weakens that.
 */
type ChargeSubject =
    | { ok: true; kind: "enrollment_agreement"; agreementId: string; customerMemberId: string }
    | { ok: true; kind: "customer"; customerId: string }
    | { ok: false; code: string; message: string };

async function resolveChargeSubject(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    /** The household, when the caller knows it. Required to fall back to a customer source. */
    customerId?: string | null,
): Promise<ChargeSubject> {
    const household = t(customerId) || null;

    if (customerMemberId) {
        const { data, error } = await supabase
            .from("child_enrollment_agreements")
            .select("id, status, created_at")
            .eq("org_id", orgId)
            .eq("customer_member_id", customerMemberId)
            .order("created_at", { ascending: false });
        if (error) return { ok: false, code: "db_error", message: error.message };
        const rows = (data ?? []) as Array<{ id: string; status: string }>;
        if (rows.length > 0) {
            // An active agreement is the billable source; otherwise the most recent one still owns
            // history. Unchanged — an enrolled child's attribution does not move.
            const active = rows.find((r) => t(r.status) === "active");
            return {
                ok: true,
                kind: "enrollment_agreement",
                agreementId: (active ?? rows[0]!).id,
                customerMemberId,
            };
        }
        // No agreement for this child. Fall through to the household rather than refusing —
        // a pre-enrolment child's fee is the FAMILY's, and that is a real, chargeable subject.
    }

    if (!household) {
        return {
            ok: false,
            code: "missing_billable_subject",
            message:
                "There is no enrollment agreement and no household in scope, so there is nothing to "
                + "charge against.",
        };
    }
    return { ok: true, kind: "customer", customerId: household };
}

/** The billable source pair for a resolved subject — one place, so callers cannot disagree. */
function billableSourceForSubject(
    subject: Extract<ChargeSubject, { ok: true }>,
): { agreementId: string | null; billableSource: { type: "enrollment_agreement" | "customer"; id: string } } {
    return subject.kind === "enrollment_agreement"
        ? {
              agreementId: subject.agreementId,
              billableSource: { type: "enrollment_agreement", id: subject.agreementId },
          }
        : { agreementId: null, billableSource: { type: "customer", id: subject.customerId } };
}

function mapError(err: unknown, correlationId: string): ActionResult {
    if (err instanceof OperationalEnrollmentServiceError) {
        const status = err.code === "not_found" ? 404 : err.code === "invalid_input" ? 400 : 409;
        return { ok: false, correlationId, status, error: err.message };
    }
    return {
        ok: false,
        correlationId,
        status: 500,
        error: err instanceof Error ? err.message : "The charge could not be created.",
    };
}

/**
 * ONE OPERATOR GESTURE, SEVERAL CHILD OBLIGATIONS — each through the canonical writer.
 *
 * This is deliberately a LOOP over the single-charge path, not a bulk write. Every obligation goes
 * through `writeTemplateDraftCharge` and, where no review boundary applies, `postChildcareCharge` —
 * the same two writers a single Add uses, so the resolution key, the review decision, the journal
 * entry and the accounting attribution are all the ones that already existed. A bulk INSERT would
 * be a second charge writer, and the charge spine exists precisely so there is only one.
 *
 * FAILURE IS REPORTED, NEVER HIDDEN. A child whose write fails does not fail the children that
 * succeeded: those charges are real, and reporting the operation as failed would tell the operator
 * that money which exists does not. The result names every child and what happened to it, and the
 * same operation re-run converges on the existing charges rather than duplicating them.
 */
async function executeMultiChildAdd(args: {
    supabase: SupabaseClient;
    ctx: { orgId: string; userId?: string | null };
    invocation: { entityType: string; entityId?: string };
    payload: Record<string, unknown>;
    subjects: Array<{ childId: string; subject: Extract<ChargeSubject, { ok: true }> }>;
    correlationId: string;
}): Promise<ActionResult> {
    const { supabase, ctx, invocation, payload, subjects, correlationId } = args;
    const today = t(payload.today) || todayYmd();

    type PerChild = {
        customer_member_id: string;
        charge_id: string | null;
        write_status: string;
        resolution_key: string | null;
        review_required: boolean;
        posted: boolean;
        error?: string;
    };

    const results: PerChild[] = [];
    for (const { childId, subject } of subjects) {
        try {
            const written = await writeTemplateDraftCharge(supabase, ctx.orgId, {
                templateId: t(payload.template_id),
                ...billableSourceForSubject(subject),
                eventDate: t(payload.event_date) || null,
                servicePeriodStart: t(payload.service_period_start) || null,
                /*
                 * THE AMOUNT IS PER CHILD. It is passed to each write unchanged and is never divided
                 * across the selection: a $40 field trip for two children is two $40 obligations,
                 * because that is what the family owes. Splitting an entered amount would invent a
                 * price nobody quoted.
                 */
                unitAmountCents: payload.amount_cents == null ? null : Number(payload.amount_cents),
                today,
                actorUserId: ctx.userId ?? null,
            });

            if (written.status === "not_writable") {
                results.push({
                    customer_member_id: childId,
                    charge_id: null,
                    write_status: written.status,
                    resolution_key: null,
                    review_required: false,
                    posted: false,
                    error: written.reason,
                });
                continue;
            }

            let posted = false;
            let postFailed: string | null = null;
            if (!written.reviewRequired && (written.status === "created" || written.status === "recalculated")) {
                try {
                    const result = await postChildcareCharge(supabase, {
                        orgId: ctx.orgId,
                        chargeId: written.chargeId,
                        actorUserId: ctx.userId ?? null,
                    });
                    posted = !result.alreadyPosted || isPostedStatus(result.charge.status);
                } catch (err) {
                    // A failed post does NOT unmake the charge. It is written, it is a draft, and
                    // the operator can post it from the row.
                    postFailed = err instanceof Error ? err.message : String(err);
                }
            }

            results.push({
                customer_member_id: childId,
                charge_id: written.chargeId,
                write_status: written.status,
                resolution_key: written.resolutionKey,
                review_required: written.reviewRequired,
                posted,
                ...(postFailed ? { error: postFailed } : {}),
            });
        } catch (err) {
            results.push({
                customer_member_id: childId,
                charge_id: null,
                write_status: "error",
                resolution_key: null,
                review_required: false,
                posted: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    const created = results.filter((r) => r.charge_id);
    const failed = results.filter((r) => !r.charge_id);

    /*
     * EVERY CHILD FAILED is an operation that did nothing, and saying "ok" would be false. One or
     * more succeeding is a real, partial, retry-safe outcome and is reported as success carrying
     * the failures — because the charges that exist must not be denied.
     */
    if (!created.length) {
        return {
            ok: false,
            correlationId,
            status: 409,
            error: failed[0]?.error || "No charges could be created for the selected children.",
        };
    }

    return {
        ok: true,
        correlationId,
        result: {
            actionKey: CHARGE_ADD_ACTION_KEY,
            entityType: invocation.entityType,
            entityId: subjects[0]!.childId || invocation.entityId || "",
            affectedId: created[0]!.charge_id,
            detail: {
                multi_child: true,
                children_selected: subjects.length,
                charges_created: created.length,
                charges_failed: failed.length,
                // Per child, so the operator sees exactly which obligations exist.
                per_child: results,
            },
        },
    };
}

/**
 * IS THIS CHARGE'S SUBJECT LEGAL FOR ITS CHARGE TYPE — asked BEFORE any money moves.
 *
 * `chargeCategorySemantics` is the code-owned authority on whose money a charge type can be, and
 * until now nothing on the WRITE path consulted it: the grain rule was honoured only by the Focus
 * Panel, which withheld the sibling checkboxes. Everything else — the household option in
 * "Applies to", a governed invocation, a replayed payload — could author `tuition` at household
 * grain, which the semantics module exists to call a contradiction.
 *
 * The check belongs here, beside the subject resolution loop that already runs before the first
 * write, because a refusal discovered halfway through leaves a family half billed.
 */
async function refuseIllegalSubjectGrain(
    supabase: SupabaseClient,
    orgId: string,
    templateId: string,
    childIds: readonly string[],
    correlationId: string,
): Promise<ActionResult | null> {
    if (!templateId) return null;
    const template = (await listChargeTemplates(supabase, orgId)).find((x) => x.id === templateId);
    // An unknown template is not this function's refusal to make; the writer says so with its own voice.
    if (!template) return null;
    // No child named IS household grain — the doctrine the whole subject model rests on.
    if (subjectGrainIsLegal(template.charge_category, childIds[0] ?? null)) return null;
    const grain = childIds.length ? "a child" : "the household";
    return {
        ok: false,
        correlationId,
        status: 409,
        error: `"${template.label}" cannot be charged to ${grain}. This charge type is ${
            childIds.length ? "household" : "child"
        }-grained, and changing that would change what the charge means.`,
    };
}

const addCharge: RegisteredAction = {
    actionKey: CHARGE_ADD_ACTION_KEY,
    defaultLabel: "Add charge",
    description: "Create a charge for a child from a configured charge template.",
    supportedEntityTypes: ["opportunity_customer_member", "child", "person", "opportunity"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.template_id)) {
            return {
                ok: false,
                blockers: [
                    {
                        code: "missing_charge_template",
                        message: "Choose a charge type.",
                        field: "template_id",
                    },
                ],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx, payload, invocation }) {
        const allowed = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, CHARGE_WRITE_PERMISSION);
        const subject = await resolveChargeSubject(
            supabase as SupabaseClient,
            ctx.orgId,
            childIdFrom(payload, invocation?.entityId, invocation?.entityType),
            t(payload?.customer_id) || null,
        );
        return {
            eligible: allowed && subject.ok,
            blockers: [
                ...(allowed
                    ? []
                    : [{ code: "charge_permission_required", message: `Creating a charge requires ${CHARGE_WRITE_PERMISSION}.` }]),
                ...(subject.ok ? [] : [{ code: subject.code, message: subject.message }]),
            ],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    /**
     * The preview is the DOMAIN's intent, not a description of the form.
     *
     * It resolves through the same `previewTemplateCharge` the write uses, so the amount, the dates
     * and the scheduled-vs-draft verdict shown to the operator are the ones that will be persisted.
     * When the template cannot resolve an amount, that is said plainly rather than shown as $0.
     */
    async buildPreview({ supabase, ctx, payload, invocation }) {
        const childLabel = t(payload?.child_label) || "this child";
        const selected = childIdsFrom(payload, invocation?.entityId, invocation?.entityType);
        const subject = await resolveChargeSubject(
            supabase as SupabaseClient,
            ctx.orgId,
            selected[0] ?? "",
            t(payload?.customer_id) || null,
        );
        if (!subject.ok) return { summary: subject.message, changes: [] };
        try {
            const { intent } = await previewTemplateCharge(supabase as SupabaseClient, ctx.orgId, {
                templateId: t(payload?.template_id),
                ...billableSourceForSubject(subject),
                eventDate: t(payload?.event_date) || null,
                servicePeriodStart: t(payload?.service_period_start) || null,
                unitAmountCents:
                    payload?.amount_cents == null ? null : Number(payload.amount_cents),
                today: t(payload?.today) || todayYmd(),
            });
            if (!intent.eligible) {
                return { summary: intent.reason ?? "This charge cannot be created right now.", changes: [] };
            }
            const amount =
                intent.amountCents == null
                    ? "amount resolved at commit"
                    : `${(intent.amountCents / 100).toLocaleString(undefined, {
                          style: "currency",
                          currency: intent.currencyCode || "USD",
                      })}`;
            /*
             * ── PER CHILD vs TOTAL, MADE IMPOSSIBLE TO MISREAD ───────────────────────────────
             *
             * The amount is the amount for EACH resulting obligation. Two children at $40 is $80
             * created, not $40 split — and the preview says both numbers out loud, because "×2" and
             * a total are the two facts an operator checks before confirming money.
             *
             * The labels come from the caller, which is the only place that knows the children's
             * names; the COUNT comes from the resolved selection, so a preview can never claim a
             * child the execution will not bill.
             */
            const labels = Array.isArray(payload?.child_labels)
                ? (payload.child_labels as unknown[]).map((v) => t(v)).filter(Boolean)
                : [];
            const multi = selected.length > 1;
            const totalCents = intent.amountCents == null ? null : intent.amountCents * selected.length;
            const money = (cents: number) =>
                (cents / 100).toLocaleString(undefined, {
                    style: "currency",
                    currency: intent.currencyCode || "USD",
                });

            const changes = [
                multi
                    ? `Applies to · ${labels.length ? labels.join(", ") : `${selected.length} children`}`
                    : `Applies to · ${childLabel}`,
                multi && intent.amountCents != null ? `${money(intent.amountCents)} per child` : null,
                multi ? `${selected.length} children selected` : null,
                multi && totalCents != null ? `Total to create · ${money(totalCents)}` : null,
                multi ? "Each child receives their own charge" : null,
                intent.occursOn ? `Occurs ${intent.occursOn}` : null,
                intent.billableOn ? `Billable ${intent.billableOn}` : null,
                intent.lifecycleStatus === "scheduled" ? "Scheduled — a future billing context" : null,
            ].filter((v): v is string => Boolean(v));
            return { summary: `${intent.templateKey} ${amount}${multi ? " per child" : ""}`, changes };
        } catch (err) {
            return {
                summary: err instanceof Error ? err.message : "This charge cannot be previewed.",
                changes: [],
            };
        }
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, CHARGE_WRITE_PERMISSION))) {
            return denied(correlationId, "Creating a charge", CHARGE_WRITE_PERMISSION, "charge_permission_required");
        }

        /*
         * ── ONE OPERATION, N INDEPENDENT OBLIGATIONS ─────────────────────────────────────────
         *
         * ── THE BATCH IDEMPOTENCY AUTHORITY IS THE ONE THAT ALREADY EXISTS ──
         *
         * There is deliberately NO new batch key, no batch table and no orchestration record.
         * `writeTemplateDraftCharge` computes `tpl:<template>:<occurs_on>:<scope>` per charge, and
         * `charges_resolution_key_unique` enforces it in the database, scoped to the billable
         * source. Two children are two billable sources, so they are two keys — and re-running the
         * identical operation converges on the SAME two charges rather than creating two more.
         *
         * That makes retry safe without inventing anything: a batch-level key would be a second
         * idempotency authority answering a question the per-charge one already answers correctly,
         * and the two would disagree the first time an operator retried a partially-succeeded batch
         * with one child removed.
         *
         * ── WHY THERE IS NO ROLLBACK ──
         *
         * Because a rollback here would be a lie. Where the review boundary is absent these charges
         * POST, and posted childcare money is immutable by database trigger — it is undone by a
         * reversing entry, never by a DELETE. "Unwinding" a partially-succeeded batch would mean
         * fabricating reversals for money the operator never saw, and the honest alternative is
         * better: say exactly which children succeeded, leave those real, and let the retry
         * converge. The operator is never lied to about what exists.
         */
        const childIds = childIdsFrom(payload, invocation.entityId, invocation.entityType);

        /* The grain rule is checked BEFORE the first write, never after the second. */
        const illegalGrain = await refuseIllegalSubjectGrain(
            supabase as SupabaseClient, ctx.orgId, t(payload?.template_id), childIds, correlationId,
        );
        if (illegalGrain) return illegalGrain;

        const subjects: Array<{ childId: string; subject: Extract<ChargeSubject, { ok: true }> }> = [];
        try {
            /*
             * EVERY SUBJECT RESOLVES BEFORE ANY CHARGE IS WRITTEN. A child that cannot be billed is
             * a configuration answer, and discovering it halfway through leaves a family half
             * billed for a trip the operator thought they had booked for two.
             */
            for (const childId of childIds.length ? childIds : [""]) {
                const resolved = await resolveChargeSubject(
                    supabase as SupabaseClient,
                    ctx.orgId,
                    childId,
                    t(payload?.customer_id) || null,
                );
                if (!resolved.ok) {
                    return { ok: false, correlationId, status: 409, error: resolved.message };
                }
                subjects.push({ childId, subject: resolved });
            }
        } catch (err) {
            return mapError(err, correlationId);
        }

        if (subjects.length > 1) {
            return await executeMultiChildAdd({
                supabase: supabase as SupabaseClient,
                ctx,
                invocation,
                payload,
                subjects,
                correlationId,
            });
        }

        try {
            const childId = subjects[0]?.childId ?? "";
            const subject = subjects[0]!.subject;
            const written = await writeTemplateDraftCharge(supabase as SupabaseClient, ctx.orgId, {
                templateId: t(payload.template_id),
                ...billableSourceForSubject(subject),
                eventDate: t(payload.event_date) || null,
                servicePeriodStart: t(payload.service_period_start) || null,
                unitAmountCents: payload.amount_cents == null ? null : Number(payload.amount_cents),
                today: t(payload.today) || todayYmd(),
                actorUserId: ctx.userId ?? null,
            });
            if (written.status === "not_writable") {
                // The domain refusing is an answer, not a failure to report.
                return { ok: false, correlationId, status: 409, error: written.reason };
            }

            /*
             * ── THE REVIEW BOUNDARY IS CONFIGURED, AND THIS NOW HONOURS IT ────────────────────
             *
             * Manual Add Charge used to end here, at a draft, and the operator then had to find the
             * row and click Post. Two confirmations of one intent — and the second was ceremony,
             * because nothing happened in between: no batch, no reviewer, no queue anyone worked.
             *
             * The platform already decides whether a review boundary exists. `posting_review` is a
             * Financial Policy — "Whether draft charges require review before they can be posted" —
             * OR'd with the template's own `review_required` flag, and the resolver has always
             * computed it. The lifecycle service discarded it, so no caller could honour a decision
             * the tenant had already made and every charge got the same ceremony regardless.
             *
             * So: where review IS required, this stops at the draft exactly as before, and Post
             * remains the operator's act. Where it is NOT, the charge becomes authoritative in the
             * same gesture that created it.
             *
             * POSTING IS STILL THE CANONICAL ACT. This calls `postChildcareCharge` — the same
             * writer `charge.post` calls — so the journal entry, the accounting-period attribution
             * and the idempotency guard are all the ones that already existed. Nothing here writes
             * a status, and the draft state is not removed from the model: generated and
             * recommended charges still land as drafts for the review surface that exists for them.
             *
             * A post that fails does NOT fail the charge: it is written, it is a draft, and the
             * operator can post it from the row. Reporting the charge as un-created because the
             * second step failed would lose a real financial record.
             */
            let posted = false;
            let postFailed: string | null = null;
            if (!written.reviewRequired && (written.status === "created" || written.status === "recalculated")) {
                try {
                    const result = await postChildcareCharge(supabase as SupabaseClient, {
                        orgId: ctx.orgId,
                        chargeId: written.chargeId,
                        actorUserId: ctx.userId ?? null,
                    });
                    posted = !result.alreadyPosted || isPostedStatus(result.charge.status);
                } catch (err) {
                    postFailed = err instanceof Error ? err.message : String(err);
                }
            }

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: CHARGE_ADD_ACTION_KEY,
                    entityType: invocation.entityType,
                    // The child when one was named; otherwise the record actually invoked against,
                    // so a household charge reports the subject it was raised from rather than "".
                    entityId: childId || invocation.entityId,
                    affectedId: written.chargeId,
                    detail: {
                        write_status: written.status,
                        resolution_key: written.resolutionKey,
                        review_required: written.reviewRequired,
                        posted,
                        ...(postFailed ? { post_failed: postFailed } : {}),
                    },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

/**
 * POST A DRAFT CHARGE — the step that makes a charge OWED.
 *
 * Add Charge deliberately creates a draft: `writeTemplateDraftCharge` "never posts", because posting
 * is a separate authoritative decision the platform keeps apart from resolution. Without a registered
 * post intent, though, nothing an operator can reach ever turns a draft into a balance, and the
 * Financials card's central question — what is owed — could only ever answer zero.
 *
 * It adds no rules. `postChildcareCharge` owns the transition, refuses an already-posted charge, and
 * the DB trigger makes the result immutable: a posted childcare charge cannot be deleted or edited in
 * place, only corrected through `source_charge_id`. That is the same append-only shape Attendance has.
 */
const postCharge: RegisteredAction = {
    actionKey: CHARGE_POST_ACTION_KEY,
    defaultLabel: "Post charge",
    description: "Post a draft charge so it becomes owed.",
    supportedEntityTypes: ["opportunity_customer_member", "child", "person", "opportunity"],
    supportedProcessKeys: [],
    /*
     * THE SUBJECT OF A POST IS THE CHARGE, not a child.
     *
     * `charge.add` needs a child because it has to resolve what the charge hangs off. Posting does
     * not: the charge id names the row, and the service is org-scoped. Demanding an entity id here
     * refused exactly the case the household source exists for — a family with a registration fee
     * and no enrolled child has no `customer_member_id` to send, so their charge could be created
     * and never posted. `validatePayload` enforces the context this action actually needs.
     */
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.charge_id)) {
            return {
                ok: false,
                blockers: [{ code: "missing_charge", message: "A charge is required.", field: "charge_id" }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx, payload }) {
        const chargeId = t(payload?.charge_id);
        const allowed = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, CHARGE_WRITE_PERMISSION);
        return {
            eligible: Boolean(chargeId) && allowed,
            blockers: [
                ...(chargeId ? [] : [{ code: "missing_charge", message: "A charge is required." }]),
                ...(allowed
                    ? []
                    : [{ code: "charge_permission_required", message: `Posting a charge requires ${CHARGE_WRITE_PERMISSION}.` }]),
            ],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        return {
            summary: `Post charge ${t(payload?.charge_label) || t(payload?.charge_id)}`,
            changes: ["The charge becomes owed and can no longer be edited in place."],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, CHARGE_WRITE_PERMISSION))) {
            return denied(correlationId, "Posting a charge", CHARGE_WRITE_PERMISSION, "charge_permission_required");
        }
        try {
            const { charge, alreadyPosted } = await postChildcareCharge(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                chargeId: t(payload.charge_id),
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: CHARGE_POST_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: charge.id,
                    /*
                     * A RETRY IS A SUCCESS, and says so.
                     *
                     * Posting is idempotent, so a resubmitted request returns the charge that is
                     * already posted rather than failing. `already_posted` is how the caller tells
                     * "I posted it" from "it was posted" without either being an error.
                     */
                    detail: { status: charge.status, already_posted: alreadyPosted },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

/**
 * CORRECT A POSTED CHARGE — the only way posted money changes.
 *
 * A posted childcare charge is immutable by DB rule: it cannot be deleted, and its financial fields
 * cannot be edited in place. `createChildcareCorrection` writes a NEW row pointing at the original
 * through `source_charge_id`, so the original stays exactly as it was posted and the correction is
 * visible as its own line in the ledger. Without a registered intent, the platform enforced
 * immutability and then offered no lawful way to fix a mistake — which is not immutability, it is a
 * dead end.
 *
 * `reversal` derives its amount (the negation of the source) and is the default. `credit` and
 * `replacement` take an explicit signed amount. All three rules live in the service; this adds none.
 */
const reverseCharge: RegisteredAction = {
    actionKey: CHARGE_REVERSE_ACTION_KEY,
    defaultLabel: "Reverse charge",
    description: "Reverse or adjust a posted charge with a new corrective record.",
    supportedEntityTypes: ["opportunity_customer_member", "child", "person", "opportunity"],
    supportedProcessKeys: [],
    // Same as posting: the corrective record's subject is the charge it references.
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.charge_id)) {
            return {
                ok: false,
                blockers: [{ code: "missing_charge", message: "A charge is required.", field: "charge_id" }],
            };
        }
        const kind = t(src.kind) || "reversal";
        if (!["reversal", "credit", "replacement"].includes(kind)) {
            return {
                ok: false,
                blockers: [{ code: "invalid_correction_kind", message: `Unknown correction: ${kind}.`, field: "kind" }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx, payload }) {
        const chargeId = t(payload?.charge_id);
        const allowed = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, CHARGE_CORRECTION_PERMISSION);
        return {
            eligible: Boolean(chargeId) && allowed,
            blockers: [
                ...(chargeId ? [] : [{ code: "missing_charge", message: "A charge is required." }]),
                ...(allowed
                    ? []
                    : [{
                          code: "correction_permission_required",
                          message: `Correcting a posted charge requires ${CHARGE_CORRECTION_PERMISSION}.`,
                      }]),
            ],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        const kind = t(payload?.kind) || "reversal";
        return {
            summary: `${kind === "reversal" ? "Reverse" : kind === "credit" ? "Credit" : "Replace"} ${
                t(payload?.charge_label) || t(payload?.charge_id)
            }`,
            changes: [
                "The original posted charge is left exactly as posted.",
                "A new corrective line references it and moves the balance.",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, CHARGE_CORRECTION_PERMISSION))) {
            return denied(
                correlationId,
                "Correcting a posted charge",
                CHARGE_CORRECTION_PERMISSION,
                "correction_permission_required",
            );
        }
        try {
            const kind = (t(payload.kind) || "reversal") as CorrectionKind;
            const row = await createChildcareCorrection(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                sourceChargeId: t(payload.charge_id),
                kind,
                // A reversal DERIVES its amount; passing one is refused by the service. Only an
                // explicit credit/replacement carries an operator amount.
                ...(kind === "reversal"
                    ? {}
                    : { amountCents: payload.amount_cents == null ? undefined : Number(payload.amount_cents) }),
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: CHARGE_REVERSE_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: row.id,
                    detail: {
                        correction_kind: kind,
                        source_charge_id: row.source_charge_id,
                        amount_cents: row.amount_cents,
                    },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

export const financialChargeActions: RegisteredAction[] = [addCharge, postCharge, reverseCharge];

/**
 * Exposed for the multi-child operation's locks.
 *
 * The OPERATION — how many obligations one gesture produces and whose they are — is the thing worth
 * testing, and it is not reachable through the registered action without standing up permission and
 * subject resolution against a database. Those two have their own coverage; this exposes the
 * orchestration between them and nothing else.
 */
export const __testables = { executeMultiChildAdd, childIdsFrom };
