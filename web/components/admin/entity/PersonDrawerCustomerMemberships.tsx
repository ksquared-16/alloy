"use client";

type CustomerPersonRow = {
    customer_id: string;
    role_type?: string | null;
    is_primary?: boolean;
    _customer_name?: string | null;
    _role_label?: string | null;
};

export function PersonDrawerCustomerMemberships({ record }: { record: Record<string, unknown> }) {
    const rows = ((record._customer_persons as CustomerPersonRow[] | undefined) ?? []).filter(
        (r) => r.customer_id
    );
    if (rows.length === 0) {
        return <p className="text-sm text-alloy-midnight/60">Not linked to a customer account.</p>;
    }

    return (
        <ul className="space-y-1.5 text-sm" data-person-drawer-customer-memberships="true">
            {rows.map((row) => {
                const label = row._customer_name?.trim() || "Customer";
                const role = row._role_label?.trim() || row.role_type?.trim() || "Contact";
                return (
                    <li key={row.customer_id} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="font-medium text-alloy-midnight/85">{label}</span>
                        <span className="text-alloy-midnight/55">· {role}</span>
                        {row.is_primary ? (
                            <span className="rounded-full border border-alloy-pine/25 bg-alloy-pine/10 px-1.5 py-px text-[10px] font-semibold text-alloy-pine">
                                Primary contact
                            </span>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}
