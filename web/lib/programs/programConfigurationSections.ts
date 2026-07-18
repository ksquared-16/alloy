export type ProgramConfigurationSection =
    | "overview"
    | "definition"
    | "offerings"
    | "pricing"
    | "availability"
    | "requirements"
    | "resources"
    | "policies"
    | "relationships"
    | "publication"
    | "assignment"
    | "history";

export const PROGRAM_CONFIGURATION_SECTIONS = new Set<ProgramConfigurationSection>([
    "overview",
    "definition",
    "offerings",
    "pricing",
    "availability",
    "requirements",
    "resources",
    "policies",
    "relationships",
    "publication",
    "assignment",
    "history",
]);

export function normalizeProgramConfigurationSection(
    value: string | null | undefined,
): ProgramConfigurationSection {
    if (value === "draft") return "definition";
    if (value === "distribution") return "publication";
    if (value === "configuration") return "policies";
    if (value === "attention") return "overview";
    return value && PROGRAM_CONFIGURATION_SECTIONS.has(value as ProgramConfigurationSection)
        ? (value as ProgramConfigurationSection)
        : "overview";
}
