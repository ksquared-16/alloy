/**
 * Slice 1 deliverable §6 — every currently-unbound semantic fact, in exactly one bucket.
 *
 * This is the INPUT to Slice 2, not a licence to create 78 canonical fields. The buckets say who
 * should own each fact, which is a different question from what to name it.
 *
 *   A  existing canonical fact — Alloy already represents it; the binding or synonym is missing
 *   B  legitimate new reusable domain fact — durable, any childcare tenant would want it
 *   C  process / participant-runtime fact — true of THIS enrollment, not of the child forever
 *   D  artifact-specific fact — meaningful only inside one document
 *   E  structured collection member — belongs to a collection, never a standalone field
 *   F  acknowledgement / signature / evidence / payment — owned by a system that is not the
 *      Field System
 */

export const CLASSIFICATION = {
    A: {
        title: "Existing canonical fact — binding or synonym missing",
        note: "Nothing new to build. Slice 2 adds the alias, or stops asking altogether.",
        facts: {
            "child.general_health": "child.medical_notes already exists and is the same fact.",
            "household.additional_notes": "customer.family_notes already exists.",
            "household.has_siblings":
                "Siblings are household MEMBERSHIP, which Alloy already models as customer_member rows. A tenant that knows the household should never ask this.",
            "household.sibling_names_ages":
                "Same: the names and ages of the other children in the household are already records, not a text field.",
        },
    },
    B: {
        title: "Legitimate new reusable domain fact",
        note: "Durable childcare vocabulary any tenant would want. Slice 2 decides names, grains and sensitivity — several are health data.",
        facts: {
            "guardian1.employer_address": "person.employer exists; its address does not.",
            "guardian2.employer_address": "person.employer exists; its address does not.",
            "household.pickup_notes": "Free-text instructions about who may collect the child.",
            "household.custody_arrangements_flag": "Safeguarding. Gate for the detail below.",
            "household.custody_arrangements_detail": "Safeguarding, conditional on the gate.",
            "household.restraining_order_flag": "Safeguarding. Gate for the detail below.",
            "household.restraining_order_relationship": "Safeguarding, conditional on the gate.",
            "child.physician_name": "Health provider — a first-class childcare fact.",
            "child.physician_phone": "Health provider.",
            "child.dentist_name": "Health provider.",
            "child.dentist_phone": "Health provider.",
            "child.birth_complications": "Health history (sensitivity: health).",
            "child.serious_illness_history": "Health history (sensitivity: health).",
            "child.insect_sting_history": "Health history — reaction risk (sensitivity: health).",
            "child.developmental_history": "Development record (sensitivity: health).",
            "child.therapy_history": "Speech / behavioural / play / OT history (sensitivity: health).",
            "imm.varicella_disease_flag": "Disease-acquired immunity — a general immunization concept, not a CIS quirk.",
            "child.eating_habits": "Daily routine.",
            "child.special_diet": "Daily routine — also a safety fact alongside allergies.",
            "child.favorite_foods": "Daily routine.",
            "child.foods_refused": "Daily routine.",
            "child.toilet_habits": "Daily routine.",
            "child.toilet_signal": "Daily routine.",
            "child.toilet_reluctance": "Daily routine.",
            "child.toilet_needs": "Daily routine.",
            "child.naps": "Daily routine.",
            "child.nap_needs": "Daily routine.",
            "child.bedtime": "Daily routine — a TIME, not free text.",
            "child.wake_time": "Daily routine — a TIME, not free text.",
            "child.social_relationships": "Behavioural profile.",
            "child.prior_care_flag": "Care history. Gate for the program below.",
            "child.prior_care_program": "Care history, conditional on the gate.",
            "child.reaction_to_strangers": "Behavioural profile.",
            "child.plays_alone": "Behavioural profile.",
            "child.favorite_activities": "Behavioural profile.",
            "child.fears": "Behavioural profile.",
            "child.comfort_strategy": "Behavioural profile — how staff settle this child.",
            "child.anger_expression": "Behavioural profile.",
            "child.personality": "Behavioural profile.",
            "household.behavior_management": "How the family handles behaviour at home.",
        },
    },
    C: {
        title: "Process / participant-runtime fact",
        note: "True of this enrollment, not of the child forever. Belongs on the enrollment, not the record.",
        facts: {
            "household.enrollment_goals": "What this family wants from THIS program, this year.",
            "child.concurrent_program": "Whether the child is also enrolled elsewhere during this term.",
        },
    },
    D: {
        title: "Artifact-specific fact",
        note: "Meaningful only inside one document. Never a canonical field.",
        facts: {
            "sys.subject_line": "The hosted form platform's own submission subject line.",
        },
    },
    E: {
        title: "Structured collection member",
        note: "Already recognized by the importer as a repeating structure. Slice 2 decides where the collection lives — never one field per occurrence.",
        facts: {
            "imm.dtap_doses": "5-dose schedule.",
            "imm.tdap_doses": "5-dose schedule.",
            "imm.polio_doses": "5-dose schedule.",
            "imm.varicella_doses": "2-dose schedule.",
            "imm.mmr_doses": "5-dose schedule.",
            "imm.hepb_doses": "5-dose schedule.",
            "imm.hepa_doses": "5-dose schedule.",
            "imm.hib_doses": "5-dose schedule.",
            "imm.other_vaccines": "8-row repeating record: vaccine name + date.",
            "imm.exempted_vaccines": "7-option choice group — which vaccines are exempted.",
            "imm.exemption_reason": "3-option choice group — religious / philosophical / other.",
        },
    },
    F: {
        title: "Acknowledgement / signature / evidence / payment — owned elsewhere",
        note: "None of these is a Field System problem. Requirements own the first three; a payment system owns the last.",
        facts: {
            "ack.tuition_terms": "Requirement (acknowledgement).",
            "ack.medical_treatment": "Requirement (acknowledgement).",
            "ack.care_and_equipment": "Requirement (acknowledgement).",
            "ack.off_premises": "Requirement (acknowledgement).",
            "ack.hold_harmless": "Requirement (acknowledgement).",
            "ack.photo_release": "Requirement (acknowledgement).",
            "ack.parent_directory": "Requirement (acknowledgement).",
            "ack.handbook_read": "Requirement (acknowledgement) over a reference document.",
            "ack.ach_terms": "Requirement (acknowledgement).",
            "sig.cis_parent": "Requirement (signature).",
            "sig.cis_update": "Requirement (signature) — recurring: re-signed whenever the record changes.",
            "sig.cis_exemption": "Requirement (signature) — conditional on the exemption path.",
            "imm.exemption_document": "Requirement (upload) — provider certificate or vaccine-education module.",
            "org.material_fee": "Fee configuration. Org-owned, not a parent fact.",
            "bank.institution": "Payment instrument. Alloy should hold a payment-method reference, never the raw details.",
            "bank.city": "Payment instrument.",
            "bank.state": "Payment instrument.",
            "bank.account_type": "Payment instrument.",
            "bank.routing_number": "Payment instrument — regulated data Alloy should not store as a field.",
            "bank.account_number": "Payment instrument — regulated data Alloy should not store as a field.",
        },
    },
};
