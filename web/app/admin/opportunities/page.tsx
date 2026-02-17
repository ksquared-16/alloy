import { createAdminClient } from "@/lib/supabaseAdmin";
import OpportunitiesClient from "./OpportunitiesClient";

export default async function OpportunitiesPage() {
    const supabase = createAdminClient();

    const { data: opportunities, error } = await supabase
        .from("opportunities")
        .select(
            "id, created_at, name, status, job_date, job_time_window, quote_total, customer_id, primary_contact_id, external_id, vertical_id, pipeline_stage_id"
        )
        .order("created_at", { ascending: false })
        .limit(1000);

    const [stagesRes, customersRes, contactsRes] = await Promise.all([
        supabase.from("pipeline_stages").select("id, name, pipeline_id").order("position", { ascending: true }),
        (opportunities ?? []).length
            ? supabase.from("customers").select("id, name").in("id", [...new Set((opportunities ?? []).map((o) => o.customer_id).filter(Boolean))] as string[])
            : { data: [] },
        (opportunities ?? []).length
            ? supabase.from("contacts").select("id, first_name, last_name, email, phone").in("id", [...new Set((opportunities ?? []).map((o) => o.primary_contact_id).filter(Boolean))] as string[])
            : { data: [] },
    ]);

    const stages = stagesRes.data ?? [];
    const customerMap = new Map((customersRes.data ?? []).map((c) => [c.id, c]));
    const contactMap = new Map((contactsRes.data ?? []).map((c) => [c.id, c]));

    const rows = (opportunities ?? []).map((o) => {
        const customer = o.customer_id ? customerMap.get(o.customer_id) : undefined;
        const contact = o.primary_contact_id ? contactMap.get(o.primary_contact_id) : undefined;
        const contactName = contact
            ? [ (contact as { first_name?: string }).first_name, (contact as { last_name?: string }).last_name ].filter(Boolean).join(" ") || null
            : null;
        return {
            ...o,
            _customer_name: (customer as { name?: string } | undefined)?.name ?? null,
            _contact_name: contactName,
            _contact_email: (contact as { email?: string } | undefined)?.email ?? null,
            _contact_phone: (contact as { phone?: string } | undefined)?.phone ?? null,
            _stage_name: o.pipeline_stage_id ? (stages.find((s) => s.id === o.pipeline_stage_id) as { name?: string })?.name ?? null : null,
        };
    });

    if (error) {
        console.error("Error fetching opportunities:", error);
        return <OpportunitiesClient initialData={[]} stages={[]} error={error?.message} />;
    }

    return (
        <OpportunitiesClient
            initialData={rows}
            stages={stages}
            error={undefined}
        />
    );
}

