/**
 * Slice 4 deliverable §1 — the B-category decision ledger.
 *
 * The question for every row is NOT "what should this field be called". It is:
 *
 *     Is this durable information Alloy should know about this entity, independent of this
 *     particular artifact and process?
 *
 * If yes, it names the canonical owner. If no, it stays with the process, artifact, relationship or
 * collection authority that already owns it. Twenty-one rows come back as Director decisions rather
 * than guesses, because ontology is a product decision and a field created wrongly is harder to
 * remove than one never created.
 *
 * THIRTY-SEVEN rows, not 36. Slice 3 reported 36 because a rule in its own classification script
 * matched "hib" as a SUBSTRING — inside the word "prohibiting" — and filed a restraining-order
 * question as a vaccine dose schedule. The same defect class this program has been chasing since
 * Slice 1, this time in the audit rather than the product. Corrected here.
 */

const R = (concept, over) => ({ concept, ...over });

export const LEDGER = [
    // ── care providers: an existing relationship owner, extended by one row each ──────────────
    R("physician.name", {
        occurrences: 1, proposed_key: "relationship.child_physician → person.full_name",
        grain: "person, via a child-scoped relationship", durable: true, sensitivity: "standard",
        existing_owner: "Relationship Definitions (`relationshipDefinitions.ts`)",
        proposed_owner: "new definition row `child_physicians`",
        disposition: "RELATIONSHIP_FACT",
        rationale:
            "The relationship doctrine names PHYSICIAN as its worked example of a configured role: adding one is a single definition row, no new provider code and no migration (`role_key` is open text). A provider's identity belongs to the provider, reached through the relationship — never written onto the household's person record.",
    }),
    R("physician.phone", { occurrences: 1, proposed_key: "relationship.child_physician → person.phone", grain: "person, via relationship", durable: true, sensitivity: "standard", existing_owner: "Relationship Definitions", proposed_owner: "nested_field_keys on `child_physicians`", disposition: "RELATIONSHIP_FACT", rationale: "The phone belongs to the physician, which is exactly why Slice 3 refused binding it to `person.phone`. As a nested field of the relationship it lands on the right record." }),
    R("dentist.name", { occurrences: 1, proposed_key: "relationship.child_dentist → person.full_name", grain: "person, via relationship", durable: true, sensitivity: "standard", existing_owner: "Relationship Definitions", proposed_owner: "new definition row `child_dentists`", disposition: "RELATIONSHIP_FACT", rationale: "Same owner as the physician, and a separate row rather than a shared 'provider' role — a dentist and a physician are different relationships, and collapsing them would lose which is which." }),
    R("dentist.phone", { occurrences: 1, proposed_key: "relationship.child_dentist → person.phone", grain: "person, via relationship", durable: true, sensitivity: "standard", existing_owner: "Relationship Definitions", proposed_owner: "nested_field_keys on `child_dentists`", disposition: "RELATIONSHIP_FACT", rationale: "As the physician's phone." }),

    // ── durable child profile facts: single-valued, generic vocabulary, unambiguous type ──────
    R("child.special_diet", { occurrences: 1, proposed_key: "customer_member.special_diet", grain: "customer_member (child)", durable: true, sensitivity: "health", existing_owner: "`field_definitions` on entity_type customer_member", proposed_owner: "new config field", disposition: "NEW_CANONICAL_FIELD", rationale: "A standing dietary restriction is used at every meal for the whole enrollment, and it sits beside allergies as a safety fact. Single-valued, generic childcare vocabulary." }),
    R("child.eating_habits", { occurrences: 1, proposed_key: "customer_member.eating_habits", grain: "customer_member", durable: true, sensitivity: "standard", existing_owner: "field_definitions", proposed_owner: "new config field", disposition: "NEW_CANONICAL_FIELD", rationale: "Operational daily-routine fact a program uses after enrollment, not an enrollment-time answer." }),
    R("child.favorite_foods", { occurrences: 1, proposed_key: "customer_member.favorite_foods", grain: "customer_member", durable: true, sensitivity: "standard", existing_owner: "field_definitions", proposed_owner: "new config field", disposition: "NEW_CANONICAL_FIELD", rationale: "Meal-service fact. Distinct from foods refused — one guides what to offer, the other what to avoid." }),
    R("child.foods_refused", { occurrences: 1, proposed_key: "customer_member.foods_refused", grain: "customer_member", durable: true, sensitivity: "standard", existing_owner: "field_definitions", proposed_owner: "new config field", disposition: "NEW_CANONICAL_FIELD", rationale: "Meal-service fact; not an allergy, and must not be conflated with one." }),
    R("child.when_does_your_child_go_to_sleep_at_nigh", { occurrences: 1, proposed_key: "customer_member.bedtime", grain: "customer_member", durable: true, sensitivity: "standard", existing_owner: "field_definitions", proposed_owner: "new config field (TIME)", disposition: "NEW_CANONICAL_FIELD", rationale: "A time, not free text — the source asks for a clock value and the field should say so. Named `bedtime`, not the school's sentence." }),
    R("child.when_does_your_child_wake_up", { occurrences: 1, proposed_key: "customer_member.wake_time", grain: "customer_member", durable: true, sensitivity: "standard", existing_owner: "field_definitions", proposed_owner: "new config field (TIME)", disposition: "NEW_CANONICAL_FIELD", rationale: "As bedtime." }),
    R("child.developmental_history", { occurrences: 1, proposed_key: "customer_member.developmental_history", grain: "customer_member", durable: true, sensitivity: "health", existing_owner: "field_definitions", proposed_owner: "new config field", disposition: "NEW_CANONICAL_FIELD", rationale: "A recognized early-childhood concept every program collects, durable for the child's whole time in care. Health-sensitive." }),
    R("child.has_your_student_ever_participated_in_sp", { occurrences: 1, proposed_key: "customer_member.therapy_history", grain: "customer_member", durable: true, sensitivity: "health", existing_owner: "field_definitions", proposed_owner: "new config field", disposition: "NEW_CANONICAL_FIELD", rationale: "Speech / occupational / behavioural / play therapy history is a standing fact staff act on, not an enrollment-time answer. Named for the concept, not the question." }),

    // ── the immunization record ───────────────────────────────────────────────────────────────
    R("child.var_history", { occurrences: 2, proposed_key: "immunization record → varicella: disease-acquired immunity", grain: "customer_member", durable: true, sensitivity: "health", existing_owner: "none — no canonical immunization record exists", proposed_owner: "the immunization collection (Director decision)", disposition: "STRUCTURED_COLLECTION", rationale: "'Had chickenpox disease' is one cell of the immunization record, not a standalone boolean: it is how varicella immunity is satisfied WITHOUT doses. It belongs to whatever owns the dose schedules — which does not exist yet." }),

    // ── enrollment-time disclosures ───────────────────────────────────────────────────────────
    R("child.has_your_child_been_in_a_school_or_dayca", { occurrences: 1, proposed_key: "enrollment.prior_care", grain: "opportunity / enrollment", durable: false, sensitivity: "standard", existing_owner: "the enrollment process", proposed_owner: "process fact on the Enrollment instance", disposition: "PROCESS_PARTICIPANT_FACT", rationale: "True of this admission, not of the child forever. A gate whose only purpose is to decide whether to ask the next question." }),
    R("prior_program.name", { occurrences: 1, proposed_key: "enrollment.prior_care_program", grain: "opportunity / enrollment", durable: false, sensitivity: "standard", existing_owner: "the enrollment process", proposed_owner: "process fact", disposition: "PROCESS_PARTICIPANT_FACT", rationale: "Context for this admission decision. A durable 'prior programs' history would be a different, larger concept nobody has asked for." }),
    R("child.has_your_child_ever_been_stung_by_a_bee_", { occurrences: 1, proposed_key: "enrollment.insect_sting_exposure", grain: "opportunity / enrollment", durable: false, sensitivity: "health", existing_owner: "the enrollment process", proposed_owner: "process fact", disposition: "PROCESS_PARTICIPANT_FACT", rationale: "The school asks because an UNKNOWN reaction is the risk. It is not an allergy and must not be filed as one — `customer_member.allergies` would assert a diagnosis nobody made." }),

    // ── safeguarding: durable, but the classification is not mine to invent ────────────────────
    R("household.are_there_any_custody_or_visiting_arrangements_we_need_to_be_aware_of", { occurrences: 1, proposed_key: "customer.custody_arrangements (flag)", grain: "customer (household)", durable: true, sensitivity: "restricted / legal", existing_owner: "none", proposed_owner: "undecided", disposition: "NEEDS_DIRECTOR_DECISION", rationale: "Durable and operationally critical — but who may see it, how long it is kept, and whether it belongs on the household or on each child's relationship are privacy decisions, not naming decisions." }),
    R("household.if_yes_please_explain_arrangements_and_custody", { occurrences: 1, proposed_key: "customer.custody_arrangements_detail", grain: "customer", durable: true, sensitivity: "restricted / legal", existing_owner: "none", proposed_owner: "undecided", disposition: "NEEDS_DIRECTOR_DECISION", rationale: "Free text describing a legal arrangement. Same classification question as its gate, with more exposure." }),
    R("household.is_there_anyone_who_has_a_legal_restraining_order_prohibiting_or_limiting_contact_with_your_child", { occurrences: 1, proposed_key: "customer.contact_restriction (flag)", grain: "customer", durable: true, sensitivity: "restricted / legal", existing_owner: "none", proposed_owner: "undecided", disposition: "NEEDS_DIRECTOR_DECISION", rationale: "The single most consequential fact in the packet — it decides who may not collect a child. It plausibly belongs to the relationship model as a NEGATIVE relationship rather than a household flag, which is precisely why it needs a decision." }),
    R("child.if_yes_their_relationship_to_your_child", { occurrences: 1, proposed_key: "customer.contact_restriction_party", grain: "customer / relationship", durable: true, sensitivity: "restricted / legal", existing_owner: "none", proposed_owner: "undecided", disposition: "NEEDS_DIRECTOR_DECISION", rationale: "Names the restricted party. If contact restriction becomes a relationship, this is that relationship's subject rather than a text field." }),

    // ── clinical history: distinct fields, or one narrative? ──────────────────────────────────
    R("child.any_known_complications_at_birth", { occurrences: 1, proposed_key: "customer_member.birth_complications", grain: "customer_member", durable: true, sensitivity: "health", existing_owner: "`customer_member.medical_notes` (a catch-all)", proposed_owner: "undecided", disposition: "NEEDS_DIRECTOR_DECISION", rationale: "Durable clinical history. Whether Alloy models history as distinct clinical categories or one narrative note is an ontology decision with real privacy weight — `medical_notes` would swallow it and lose the distinction." }),
    R("child.serious_illness_and_or_hospitalizations", { occurrences: 1, proposed_key: "customer_member.medical_history", grain: "customer_member", durable: true, sensitivity: "health", existing_owner: "`customer_member.medical_notes`", proposed_owner: "undecided", disposition: "NEEDS_DIRECTOR_DECISION", rationale: "Same question as birth complications, and they should be decided together." }),

    // ── toileting: four questions that are probably one operational fact ──────────────────────
    ...[
        ["child.toilet_habits", "Toilet habits"],
        ["child.how_does_your_child_indicate_their_bathr", "How the child signals a need"],
        ["child.are_they_ever_reluctant_to_use_the_bathr", "Reluctance"],
        ["child.any_specific_toileting_needs_we_need_to_", "Specific needs"],
    ].map(([concept, what]) =>
        R(concept, { occurrences: 1, proposed_key: "customer_member.toileting_routine (proposed merge of 4)", grain: "customer_member", durable: true, sensitivity: "standard", existing_owner: "none", proposed_owner: "undecided", disposition: "NEEDS_DIRECTOR_DECISION", rationale: `${what} — one of four questions this school asks about toileting. They are plausibly ONE durable routine fact, and merging four authored questions into one concept is a product decision, not label normalization.` })
    ),

    // ── naps: two questions, probably one fact ────────────────────────────────────────────────
    R("child.does_your_child_become_tired_or_nap_duri", { occurrences: 1, proposed_key: "customer_member.nap_routine (proposed merge of 2)", grain: "customer_member", durable: true, sensitivity: "standard", existing_owner: "none", proposed_owner: "undecided", disposition: "NEEDS_DIRECTOR_DECISION", rationale: "Whether the child naps, and what they need at naptime, are two questions about one routine. Merge or keep separate is a decision." }),
    R("child.any_special_naptime_needs", { occurrences: 1, proposed_key: "customer_member.nap_routine (proposed merge of 2)", grain: "customer_member", durable: true, sensitivity: "standard", existing_owner: "none", proposed_owner: "undecided", disposition: "NEEDS_DIRECTOR_DECISION", rationale: "Pairs with the question above." }),

    // ── the child's temperament: nine questions, one profile ──────────────────────────────────
    ...[
        ["child.how_would_you_describe_your_child_s_pers", "temperament"],
        ["child.does_your_child_have_any_fears_dark_spid", "fears"],
        ["child.how_is_your_child_comforted", "comfort strategy"],
        ["child.how_does_your_child_express_anger_or_fru", "expressing frustration"],
        ["child.social_relationships", "social style"],
        ["child.is_your_child_able_to_play_alone", "independent play"],
        ["child.how_does_your_child_react_to_strangers", "reaction to strangers"],
        ["child.what_are_your_child_s_favorite_toys_or_a", "favourite activities"],
        ["child.do_you_use_any_kind_of_behavior_manageme", "behaviour management at home"],
    ].map(([concept, aspect]) =>
        R(concept, { occurrences: 1, proposed_key: "child profile — proposed 5 concepts from 9 questions", grain: "customer_member (one is household)", durable: true, sensitivity: "standard", existing_owner: "none", proposed_owner: "undecided", disposition: "NEEDS_DIRECTOR_DECISION", rationale: `Covers ${aspect}. These nine questions are how ONE school words a child's profile; a teacher uses them all year, so they are durable — but the right concepts (temperament · fears · comfort strategy · social style · favourite activities) are an ontology decision, and encoding this school's sentences as field keys is exactly what §7 forbids.` })
    ),
];

export const DISPOSITIONS = [
    "EXISTING_CANONICAL",
    "NEW_CANONICAL_FIELD",
    "RELATIONSHIP_FACT",
    "STRUCTURED_COLLECTION",
    "PROCESS_PARTICIPANT_FACT",
    "ARTIFACT_SPECIFIC",
    "OTHER_PLATFORM_OWNER",
    "NEEDS_DIRECTOR_DECISION",
];
