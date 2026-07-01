/** Auto-create toggles on `form_public_links.metadata` — default false (production-safe). */
export type IntakeAutoCreateFlags = {
    auto_create_person: boolean;
    auto_create_customer: boolean;
    auto_create_customer_member: boolean;
    auto_create_opportunity: boolean;
};

function readBool(m: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
    const v = m[key];
    return typeof v === "boolean" ? v : defaultValue;
}

export function parseIntakeAutoCreateFlags(linkMetadata: Record<string, unknown> | null | undefined): IntakeAutoCreateFlags {
    const m = (linkMetadata ?? {}) as Record<string, unknown>;
    return {
        auto_create_person: readBool(m, "auto_create_person", false),
        auto_create_customer: readBool(m, "auto_create_customer", false),
        auto_create_customer_member: readBool(m, "auto_create_customer_member", false),
        auto_create_opportunity: readBool(m, "auto_create_opportunity", false),
    };
}
