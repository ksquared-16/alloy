/**
 * THE VACCINES ALLOY RECORDS — a small, explicit vocabulary, keyed the way the Oregon Certificate
 * of Immunization Status (and the ACIP childhood schedule behind it) names them.
 *
 * `person_health_facts` already stores an immunization as `{ vaccine_key, doses[] }`; until now
 * nothing said which keys exist, so a key was whatever a caller typed. This list is the authority
 * for the key and its operator-facing name. It says nothing about which doses are REQUIRED — that
 * is a jurisdiction's schedule, and requirement satisfaction is evaluated elsewhere, never stored.
 */

export type ImmunizationVaccine = {
    readonly key: string;
    readonly label: string;
};

export const IMMUNIZATION_VACCINES: readonly ImmunizationVaccine[] = [
    { key: "dtap", label: "DTaP (diphtheria, tetanus, pertussis)" },
    // The adolescent / booster formulation is a DIFFERENT vaccine from DTaP, and the Oregon CIS has
    // its own row for it — never folded into DTaP doses.
    { key: "tdap", label: "Tdap (tetanus, diphtheria, pertussis booster)" },
    { key: "ipv", label: "Polio (IPV)" },
    { key: "varicella", label: "Varicella (chickenpox)" },
    { key: "mmr", label: "MMR (measles, mumps, rubella)" },
    { key: "hepb", label: "Hepatitis B" },
    { key: "hepa", label: "Hepatitis A" },
    { key: "hib", label: "Hib (Haemophilus influenzae type b)" },
    { key: "pcv", label: "Pneumococcal (PCV)" },
    { key: "rotavirus", label: "Rotavirus" },
    { key: "influenza", label: "Influenza" },
    { key: "covid19", label: "COVID-19" },
];

const BY_KEY = new Map(IMMUNIZATION_VACCINES.map((v) => [v.key, v]));

export function immunizationVaccine(key: string | null | undefined): ImmunizationVaccine | null {
    return BY_KEY.get(String(key ?? "").trim().toLowerCase()) ?? null;
}

export function immunizationVaccineLabel(key: string | null | undefined): string {
    return immunizationVaccine(key)?.label ?? (String(key ?? "").trim() || "Immunization");
}
