/**
 * Who owns the answer?
 *
 * The importer had become good at understanding the QUESTION and was still guessing at the OWNER.
 * That showed up as one behaviour: when nothing else matched, propose a new Field System field. So a
 * bank routing number became a `customer` text field, "Today's Date" became a person field, and a
 * child's medical history became generic child text — each at the end of a chain of failed matches
 * rather than at the end of a decision.
 *
 * The rule this module exists to enforce:
 *
 *     NEW_CANONICAL_FIELD is an affirmative ownership conclusion, never the fallback for
 *     "nothing else matched."
 *
 * So the default here is `HELD_UNKNOWN_OWNER`, and `CANONICAL_FIELD` is reachable only by positively
 * resolving a settled canonical destination. Unknown ownership stays reviewable. It never becomes a
 * field on its own.
 *
 * This is a routing pass, not a second proposal engine: every conclusion delegates to vocabulary
 * that already exists — `ownershipHoldFor`, `safeguardingConceptKind`, `suggestFieldBinding`, the
 * child-profile manifest, and `systemFieldRegistry`.
 *
 * Pure + deterministic. No I/O.
 */

import type { BusinessConceptCandidate, DerivedValueKind } from "./contracts";
import { ownershipHoldFor, type OwnershipHoldState } from "./canonicalOwnershipHolds";
import { safeguardingConceptKind } from "./safeguardingConcepts";
import { suggestFieldBinding } from "@/lib/forms/canonicalBindingSuggestions";
import { CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST } from "@/lib/fields/customerMemberFieldRegistry";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import type { FormFieldSource } from "@/lib/forms/schema";

export type OwnershipOwner =
    | "CANONICAL_FIELD"
    | "RELATIONSHIP"
    | "STRUCTURED_COLLECTION"
    | "DOCUMENT_EVIDENCE"
    | "BUSINESS_PROCESS"
    | "PROCESS_PARTICIPANT"
    | "ARTIFACT_RESPONSE"
    | "FINANCIAL_PAYMENT"
    | "HEALTH"
    | "SAFEGUARDING"
    | "CONSENT"
    | "REQUIREMENT_EXCEPTION"
    | "DERIVED_SYSTEM"
    | "HELD_UNKNOWN_OWNER";

export interface OwnershipRouting {
    owner: OwnershipOwner;
    /** Why, in operator language. Never ontology jargon. */
    basis: string;
    /** Present only for `CANONICAL_FIELD` and `PROCESS_PARTICIPANT` — the destination that exists. */
    destination?: FormFieldSource;
    /** For `DERIVED_SYSTEM`: which derivation, structurally — what a consumer computes. */
    derivedKind?: DerivedValueKind;
    /** For `DERIVED_SYSTEM`: what it is derivable from, so the operator can check the reasoning. */
    derivedFrom?: string;
    /**
     * A concept whose ownership IS settled but whose canonical type is not yet adoptable.
     *
     * Bedtime and wake time are the case: they are wall-clock times, `alloyTimeValue` already owns
     * the `HH:mm` contract, and the Form type system has not adopted it across all seven surfaces.
     * Creating a text field to move past that would manufacture the false durable truth this whole
     * pass exists to prevent — a "bedtime" that accepts "whenever".
     */
    blockedOn?: "TIME_ADOPTION";
    /**
     * Which KIND of financial thing, for `FINANCIAL_PAYMENT`.
     *
     * "It is financial" is not one fact. A routing number is a credential the family holds; a
     * tuition amount is configuration the school holds. Collapsing them cost a real judgment: an
     * artifact was held as payment setup because it carried a single material-fee line, which would
     * have stopped a signed tuition agreement from executing.
     */
    financialKind?: "credential" | "method_setup" | "billing_configuration";
    /** For held owners, the state the certification record uses. */
    holdState?: OwnershipHoldState | "HELD_PENDING_FINANCIALS" | "HELD_UNKNOWN_OWNER";
    /**
     * May this be swept into a bulk "accept all high-confidence" action?
     *
     * A confidence score measures how sure the matcher is about the QUESTION. It says nothing about
     * whether the destination is safe. A 99%-confident routing number is still a routing number.
     */
    bulkAcceptSafe: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial. First, because it is the one where a wrong answer stores a credential.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A protected banking credential. Alloy has NO canonical destination for any of these and must not
 * acquire one to satisfy a packet: `customer_payment_methods` stores a Stripe token plus brand and
 * last4, and the raw number never reaches Alloy at all — it goes to the provider.
 *
 * This is the strictest rule in the module. It is checked before everything else, it can never
 * produce a field, and it can never be bulk-accepted.
 */
const PROTECTED_FINANCIAL_CREDENTIAL =
    /\b(routing\s*(number|no\.?|#)?|aba\s*(number)?|account\s*(number|no\.?|#)|bank\s*account|iban|swift|sort\s*code)\b/i;

/** Payment-method SETUP input — transient at the provider, never durable Alloy truth. */
const PAYMENT_METHOD_SETUP =
    /\b(financial\s*institution|bank\s*name|account\s*type|checking\s*or\s*savings|account\s*holder|name\s*on\s*(the\s*)?account|voided\s*check)\b/i;

/** Billing configuration — an amount the ORG charges, not a fact about a family. */
const BILLING_CONFIGURATION =
    /\b(fee|tuition|rate|deposit|price|charge|amount\s*due|monthly\s*(cost|payment))\b/i;

// ─────────────────────────────────────────────────────────────────────────────
// Derived. A value Alloy can compute is not a value Alloy should store.
// ─────────────────────────────────────────────────────────────────────────────

/** Age is DOB plus a date. Storing it guarantees it is wrong by the next birthday. */
const AGE_AT_A_DATE = /\bage\b(?![a-z])/i;

/** Household membership already answers this. */
const SIBLING_EXISTENCE = /\b(sibling|siblings|brothers?\s*(or|and|\/)\s*sisters?)\b/i;

/**
 * A wall-clock time of day. Settled as a fact, unavailable as a type.
 */
const TIME_OF_DAY_QUESTION =
    /\b(what time|when does .{0,40}(go to (sleep|bed)|wake|wakes)|bed\s?time|bedtime|wake[- ]?up time)\b/i;

/**
 * A person named by their role in relation to the child.
 *
 * A parent's or guardian's NAME is a person, reached through a relationship — the same conclusion
 * Slice 4 reached for a physician and a dentist. Writing it onto a field would put one person's name
 * on another record, and would lose which of the two guardians it was.
 */
const PERSON_BY_ROLE_NAME =
    /\b(parent|guardian|mother|father|caregiver|emergency\s*contact|guardians?)\b[^.]{0,30}\bnames?\b|\brelationship to (your|the) child\b/i;

// ─────────────────────────────────────────────────────────────────────────────
// Settled canonical destinations. The ONLY route to CANONICAL_FIELD.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The child-profile facts Slice 5 settled, matched by their own manifest labels.
 *
 * This is the affirmative half of the rule. A concept reaches `CANONICAL_FIELD` because a canonical
 * destination for it already EXISTS — decided by a Director, seeded for every org, and derived
 * across every surface. It does not reach it because the label sounded like a profile fact.
 *
 * Derived from the manifest, so a new settled fact becomes routable by adding one manifest row —
 * the same property Slice 5 established for the other surfaces.
 */
interface ManifestMatch {
    fieldKey: string;
    test: RegExp;
}

function manifestMatchers(): ManifestMatch[] {
    return CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.map((row) => {
        // The field's OWN vocabulary, declared beside it in the manifest. Falls back to the label
        // when a field declares none. Nothing here is authored from a school's phrasing — a school
        // that writes "toilet habits" and a manifest that says "toileting routine" mean one fact,
        // and that equivalence belongs to the field, not to the importer.
        const terms = row.match_terms?.length
            ? row.match_terms
            : [row.label.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, "\\s+")];
        const pattern = terms.join("|");
        return { fieldKey: row.field_key, test: new RegExp(`(${pattern})`, "i") };
    });
}

const MANIFEST_MATCHERS = manifestMatchers();

/** Enrollment/process truth that already has a registered destination. */
const ENROLLMENT_START =
    /\b(first\s*day|start\s*date|starting\s*date|desired\s*start|begins?\s*(on|attending))\b/i;

function registryDestination(id: string): FormFieldSource | undefined {
    const row = OPERATIONAL_FORM_SYSTEM_FIELDS.find((f) => f.id === id);
    if (!row) return undefined;
    return {
        entity_type: row.entity_type,
        field_key: row.field_key,
        ...(row.shared_value_key ? { shared_value_key: row.shared_value_key } : {}),
    };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface RouteOwnershipInput
    extends Pick<BusinessConceptCandidate, "label" | "concept_key"> {
    suggestedDataType?: string;
    repetition?: { member_labels?: readonly string[] };
}

export function routeOwnership(concept: RouteOwnershipInput): OwnershipRouting {
    const label = concept.label ?? "";
    const text = `${label} ${(concept.concept_key ?? "").replace(/[._]/g, " ")}`;

    // 1. Protected financial credentials. Nothing overrides this.
    if (PROTECTED_FINANCIAL_CREDENTIAL.test(text)) {
        return {
            owner: "FINANCIAL_PAYMENT",
            holdState: "HELD_PENDING_FINANCIALS",
            financialKind: "credential",
            bulkAcceptSafe: false,
            basis:
                "A bank routing or account number. Alloy has no destination for one and must not gain one — payment setup hands the raw number to the payment provider, and what comes back is a token plus the last four digits.",
        };
    }

    // 2. Payment-method setup and billing configuration.
    if (PAYMENT_METHOD_SETUP.test(text)) {
        return {
            owner: "FINANCIAL_PAYMENT",
            holdState: "HELD_PENDING_FINANCIALS",
            financialKind: "method_setup",
            bulkAcceptSafe: false,
            basis:
                "Payment-method setup detail. It exists while the provider is being set up and is not durable Alloy truth; the signed authorization is kept as a document instead.",
        };
    }
    if (BILLING_CONFIGURATION.test(text)) {
        return {
            owner: "FINANCIAL_PAYMENT",
            holdState: "HELD_PENDING_FINANCIALS",
            financialKind: "billing_configuration",
            bulkAcceptSafe: false,
            basis:
                "An amount the school charges — billing configuration, owned by rate plans. It is not a fact about this child, and storing it on the child would make every family's copy drift from the school's.",
        };
    }

    // 3. Safeguarding (Slice 6 owner).
    if (safeguardingConceptKind({ label, concept_key: concept.concept_key })) {
        return {
            owner: "SAFEGUARDING",
            bulkAcceptSafe: false,
            basis: "A restriction on this child — recorded as a safeguarding restriction with its own approval.",
        };
    }

    // 4. Health / consent / requirement exception (Slice 5 holds).
    const hold = ownershipHoldFor({
        label,
        concept_key: concept.concept_key,
        ...(concept.repetition ? { repetition: concept.repetition } : {}),
    });
    if (hold) {
        const owner: OwnershipOwner =
            hold.state === "AWAITING_HEALTH_FOUNDATION"
                ? "HEALTH"
                : hold.state === "AWAITING_CANONICAL_CONSENT_OWNER"
                  ? "CONSENT"
                  : "REQUIREMENT_EXCEPTION";
        return { owner, holdState: hold.state, bulkAcceptSafe: false, basis: hold.explanation };
    }

    // 5. Derived values. Checked before canonical destinations so a computable value never wins a
    //    field just because its label resembles one.
    if (AGE_AT_A_DATE.test(text)) {
        return {
            owner: "DERIVED_SYSTEM",
            derivedKind: "age_at_date",
            derivedFrom: "date of birth and the enrolment start date",
            bulkAcceptSafe: false,
            basis:
                "Age is date of birth plus a date. Stored as a field it is wrong by the next birthday, and two places would then disagree about how old the child is.",
        };
    }
    if (SIBLING_EXISTENCE.test(text)) {
        return {
            owner: "DERIVED_SYSTEM",
            derivedKind: "household_membership",
            derivedFrom: "the other children in this household",
            bulkAcceptSafe: false,
            basis:
                "Whether this child has siblings is already answered by the household's other children. A stored answer would go stale the moment a family adds one.",
        };
    }

    // 6. Execution dates. The platform matcher ALREADY identifies these; discovery used to discard
    //    the answer because it carried no `field_source`, and proposing a field was what happened
    //    next. A signature or submission date belongs to the execution, never to a person.
    const suggestion = suggestFieldBinding(label, concept.suggestedDataType ?? "text");
    if (suggestion?.special === "signature_date" || suggestion?.special === "submission_date") {
        return {
            owner: "DERIVED_SYSTEM",
            derivedKind: "execution_date",
            derivedFrom: suggestion.special === "signature_date" ? "when the form was signed" : "when the form was submitted",
            bulkAcceptSafe: false,
            basis:
                suggestion.special === "signature_date"
                    ? "The date beside a signature is when it was signed. The runtime records that; a person does not have a field called “date”."
                    : "A date meaning “today” is when the form was submitted. The runtime records that; it is not a fact about anybody.",
        };
    }

    // 7. A person named by their role — a relationship, not a field.
    if (PERSON_BY_ROLE_NAME.test(label)) {
        return {
            owner: "RELATIONSHIP",
            bulkAcceptSafe: false,
            basis:
                "This names a person by their role. People are linked to a child as relationships, so the answer creates or links a person rather than filling in a field — which is also what keeps two guardians distinguishable.",
        };
    }

    // 8. A settled fact whose TYPE is not adoptable yet.
    if (TIME_OF_DAY_QUESTION.test(label)) {
        return {
            owner: "HELD_UNKNOWN_OWNER",
            holdState: "HELD_UNKNOWN_OWNER",
            blockedOn: "TIME_ADOPTION",
            bulkAcceptSafe: false,
            basis:
                "A time of day. Alloy already has a time contract, and the form type system has not adopted it yet — so this stays a form answer. A text field here would accept \u201cwhenever\u201d as a bedtime.",
        };
    }

    // 9. Enrollment/process truth with a registered destination.
    if (ENROLLMENT_START.test(text)) {
        const destination = registryDestination("start_date");
        if (destination) {
            return {
                owner: "PROCESS_PARTICIPANT",
                destination,
                bulkAcceptSafe: true,
                basis: "When this child starts is enrolment truth, and Alloy already has a start date. A child-profile copy would be a second answer to the same question.",
            };
        }
    }

    // 10. THE AFFIRMATIVE CONCLUSION. A settled canonical destination exists for this concept.
    for (const m of MANIFEST_MATCHERS) {
        if (!m.test.test(label)) continue;
        return {
            owner: "CANONICAL_FIELD",
            destination: { entity_type: "customer_member", field_key: m.fieldKey },
            bulkAcceptSafe: true,
            basis: "A durable fact about this child that Alloy already has a home for.",
        };
    }

    // 11. Default. NOT a field.
    return {
        owner: "HELD_UNKNOWN_OWNER",
        holdState: "HELD_UNKNOWN_OWNER",
        bulkAcceptSafe: false,
        basis:
            "Nothing in Alloy owns this yet. It is collected on the form and kept with the process, because a field created here would assert durable truth that no one has decided on.",
    };
}

/** Owners whose concepts may never be swept into a bulk accept, whatever the confidence. */
export const OWNERS_NEVER_BULK_ACCEPTABLE: readonly OwnershipOwner[] = [
    "FINANCIAL_PAYMENT",
    "HEALTH",
    "SAFEGUARDING",
    "CONSENT",
    "REQUIREMENT_EXCEPTION",
    "DERIVED_SYSTEM",
    "HELD_UNKNOWN_OWNER",
];
