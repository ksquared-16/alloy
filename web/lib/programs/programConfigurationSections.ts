export type ProgramConfigurationSection =
    | "overview"
    | "definition"
    | "requirements"
    | "resources"
    | "availability"
    | "offerings"
    | "pricing"
    | "publication"
    | "assignment"
    | "history"
    | "attention";

export const PROGRAM_CONFIGURATION_SECTIONS = new Set<ProgramConfigurationSection>([
    "overview",
    "definition",
    "requirements",
    "resources",
    "availability",
    "offerings",
    "pricing",
    "publication",
    "assignment",
    "history",
    "attention",
]);

export function normalizeProgramConfigurationSection(
    value: string | null | undefined,
): ProgramConfigurationSection {
    if (value === "draft") return "definition";
    if (value === "distribution") return "publication";
    return value && PROGRAM_CONFIGURATION_SECTIONS.has(value as ProgramConfigurationSection)
        ? (value as ProgramConfigurationSection)
        : "overview";
}
