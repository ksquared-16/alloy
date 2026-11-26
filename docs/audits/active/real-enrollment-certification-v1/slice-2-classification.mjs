/**
 * Slice 2 deliverable §8 — the A–F classification, re-run after packet-level correlation.
 *
 * The denominator moved. Slice 1 hand-counted 113 semantic facts with 78 unbound. The packet as the
 * importer now reads it is 86 facts with 75 unbound, plus 32 OBLIGATIONS that are no longer facts at
 * all. Every delta is explained in `DELTAS`.
 *
 * The keys are MEASURED — produced by running the real corpus through the pipeline into
 * `slice-2-unbound-keys.txt`, not hand-authored. `slice-2-classification-check.mjs` proves the
 * partition against that file, so a key that changes shape fails the check instead of silently
 * dropping out of the classification.
 */

export const CLASSIFICATION = {
    A: {
        title: "Existing canonical fact — binding or synonym missing",
        note: "Alloy already has the field. Slice 3 adds the alias, or stops asking.",
        keys: {
            "account_holder.name": "A person's name. person.first_name / last_name exist.",
            "child.does_your_child_have_siblings": "Siblings are household MEMBERSHIP, already modelled as records.",
            "child.does_your_student_need_any_accommodation": "child.special_instructions exists.",
            "child.general_health": "child.medical_notes exists.",
            "child.how_would_you_describe_your_child_s_gender": "child.gender exists.",
            "child.is_there_anything_else_you_would_like_us": "customer.family_notes exists.",
            "child.student_s_first_day": "enrollment.start_date exists.",
            "guardian.name": "person.first_name / person.last_name exist.",
            "guardian.parent_guardian_1_employer": "person.employer exists.",
            "guardian.parent_guardian_2_employer": "person.employer exists.",
            "sibling.name": "Same: the other children are records, not a text field.",
        },
    },
    B: {
        title: "Legitimate new reusable domain fact",
        note: "Durable childcare vocabulary. Names, grains and sensitivity are Slice 3's; much of this is health data.",
        keys: {
            "child.any_known_complications_at_birth": "Health history (sensitivity: health).",
            "child.any_special_naptime_needs": "Daily routine.",
            "child.any_specific_toileting_needs_we_need_to_": "Daily routine.",
            "child.are_they_ever_reluctant_to_use_the_bathr": "Daily routine.",
            "child.developmental_history": "Health history (sensitivity: health).",
            "child.do_you_use_any_kind_of_behavior_manageme": "Behavioural profile.",
            "child.does_your_child_become_tired_or_nap_duri": "Daily routine.",
            "child.does_your_child_have_any_fears_dark_spid": "Behavioural profile.",
            "child.eating_habits": "Daily routine.",
            "child.favorite_foods": "Daily routine.",
            "child.foods_refused": "Daily routine.",
            "child.has_your_child_been_in_a_school_or_dayca": "Care history.",
            "child.has_your_child_ever_been_stung_by_a_bee_": "Health history (sensitivity: health).",
            "child.has_your_student_ever_participated_in_sp": "Health history (sensitivity: health).",
            "child.how_does_your_child_express_anger_or_fru": "Behavioural profile.",
            "child.how_does_your_child_indicate_their_bathr": "Daily routine.",
            "child.how_does_your_child_react_to_strangers": "Behavioural profile.",
            "child.how_is_your_child_comforted": "Behavioural profile.",
            "child.how_would_you_describe_your_child_s_pers": "Behavioural profile.",
            "child.if_yes_their_relationship_to_your_child": "Safeguarding, conditional on the gate.",
            "child.is_your_child_able_to_play_alone": "Behavioural profile.",
            "child.serious_illness_and_or_hospitalizations": "Health history (sensitivity: health).",
            "child.social_relationships": "Behavioural profile.",
            "child.special_diet": "Daily routine.",
            "child.toilet_habits": "Daily routine.",
            "child.var_history": "Disease-acquired immunity — a general immunization concept.",
            "child.what_are_your_child_s_favorite_toys_or_a": "Behavioural profile.",
            "child.when_does_your_child_go_to_sleep_at_nigh": "Daily routine.",
            "child.when_does_your_child_wake_up": "Daily routine.",
            "dentist.name": "Health provider.",
            "household.are_there_any_custody_or_visiting_arrangements_we_need_to_be_aware_of": "Safeguarding. The gate for the detail that follows.",
            "household.if_yes_please_explain_arrangements_and_custody": "Safeguarding, conditional on the gate.",
            "physician.name": "Health provider.",
            "prior_program.name": "Care history.",
        },
    },
    C: {
        title: "Process / participant-runtime fact",
        note: "True of this enrollment, not of the child forever.",
        keys: {
            "child.student_age_upon_enrolling": "Derived from date of birth and first day. Must never be asked.",
            "child.what_would_you_like_your_child_to_gain_f": "What this family wants from THIS program, this year.",
            "child.will_your_student_be_simultaneously_enro": "Concurrent enrollment during this term.",
        },
    },
    D: {
        title: "Artifact-specific fact",
        note: "Meaningful only inside one document. Never a canonical field.",
        keys: {
            "child.subject_line": "The hosted form platform's own submission subject line.",
        },
    },
    E: {
        title: "Structured collection member",
        note: "Recognized by the importer as a repeating structure. One decision each, never one field per occurrence.",
        keys: {
            "child.diphtheria_tetanus_pertussis_difteriat_t": "5-dose schedule.",
            "child.hep_a": "5-dose schedule.",
            "child.hep_b": "5-dose schedule.",
            "child.hib": "5-dose schedule.",
            "child.measles_mumps_rubella_mmr_sarampi_npaper": "5-dose schedule.",
            "child.module": "2-option choice group — exemption document (English block).",
            "child.polio": "7-option choice group — which vaccines are exempted.",
            "child.polio_ipv": "5-dose schedule.",
            "child.religious": "3-option choice group — exemption reason.",
            "child.sp": "2-option choice group — exemption document (Spanish block).",
            "child.tdap": "5-dose schedule.",
            "child.vaccine_name_nombre_de_la_vacuna": "8-row repeating record: vaccine name + date.",
            "child.varicella_chickenpox_varicela": "2-dose schedule.",
            "household.is_there_anyone_who_has_a_legal_restraining_order_prohibiting_or_limiting_contact_with_your_child": "5-dose schedule.",
            "relationship.emergency_contact": "13 destinations across three emergency contacts — ONE repeatable relationship.",
        },
    },
    F: {
        title: "Acknowledgement / signature / evidence / payment — owned elsewhere",
        note: "Not a Field System problem. The six signature dates belong to their signatures; the banking details to a payment system.",
        keys: {
            "child.date": "Belongs to the signature it dates, not to the child.",
            "child.date_fecha": "Belongs to the signature it dates, not to the child.",
            "child.date_fecha_2": "Belongs to the signature it dates, not to the child.",
            "child.date_fecha_3": "Belongs to the signature it dates, not to the child.",
            "child.non_refundable_annual_material_fee": "Fee configuration. Org-owned, not a parent fact.",
            "financial_institution.financial_institution": "Payment instrument.",
            "household.account_number_typically_the_second_set_": "Payment instrument — regulated data Alloy should not store as a field.",
            "household.routing_number_typically_the_first_set_o": "Payment instrument — regulated data Alloy should not store as a field.",
            "household.select_account_type": "Payment instrument.",
            "household.today_s_date": "Belongs to the signature it dates, not to the child.",
            "person.today_s_date": "Belongs to the signature it dates, not to the child.",
        },
    },
};

/** Why the denominator moved from Slice 1's 78 unbound to Slice 2's 75. */
export const DELTAS = [
    {
        change: "Obligations left the fact denominator entirely",
        detail:
            "Slice 1 counted 9 acknowledgements, 3 signatures and 1 upload among the 78 unbound FACTS. They are obligations, and packet intake counts them as such: 32 unique obligations — 22 acknowledgements, 6 signatures, 4 upload requirements — of which 6 merged across artifacts. −13 facts.",
    },
    {
        change: "Emergency contacts became one relationship, not twelve fields",
        detail:
            "Slice 1 listed ec1/ec2/ec3 × name, relationship, phone, address as 12 unbound facts. The reader recognizes ONE emergency-contact relationship covering 13 destinations. −12 facts, +1.",
    },
    {
        change: "The handbook stopped contributing facts",
        detail:
            "G4: the 8 prose lines it proposed as fields are gone, and a reference document is now excluded from fact correlation outright. It contributes 11 acknowledgements and 1 upload requirement instead.",
    },
    {
        change: "The hosted form's declared semantics bound facts a PDF heuristic could not",
        detail:
            "11 facts carry a canonical binding proposal, against 3 on the CIS alone in Slice 1. Guardian phone, email and address, household address, allergies and medications bind because the hosted form states its labels outright rather than leaving them to be guessed from geometry.",
    },
    {
        change: "Party-scoped keys split facts that were wrongly one",
        detail:
            "The physician's phone, the dentist's phone and the guardian's phone are three facts, not one `person.phone`. That RAISES the fact count and lowers the risk — a correlation asserting the child's name and the physician's name were the same fact is worse than two extra rows. See the blockers: the matcher still proposes a person-phone binding for a physician's phone.",
    },
    {
        change: "Cross-artifact correlation merged three facts",
        detail:
            "child.name (7 destinations), guardian.name (4) and child.date_of_birth (3) are one fact each across two artifacts rather than two.",
    },
    {
        change: "The custody and restraining-order questions came back",
        detail:
            "They sit under the emergency-contact heading and were being absorbed into the relationship group — 3 safeguarding facts that produced no concept at all. A relationship now claims only fields that describe a person, so they surface as the household facts they are.",
    },
];
