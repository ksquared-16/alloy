/** Child overview section titles — code-driven until layout config ships. */
export function personDrawerChildSectionTitle(sectionKey: string, defaultTitle: string): string {
    if (sectionKey === "basic_info") return "Child details";
    if (sectionKey === "enrollment_activity") return "Enrollment";
    if (sectionKey === "relationships") return "Family";
    return defaultTitle;
}
