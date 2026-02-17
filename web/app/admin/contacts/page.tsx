import { createAdminClient } from "@/lib/supabaseAdmin";
import ContactsClient from "./ContactsClient";

export default async function ContactsPage() {
  const supabase = createAdminClient();

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select(
      "id, created_at, first_name, last_name, email, phone, status, customer_id, external_id"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Error fetching contacts:", error);
    return <ContactsClient initialData={[]} error={error?.message} />;
  }

  const list = contacts ?? [];
  const customerIds = [...new Set(list.map((c) => c.customer_id).filter(Boolean))] as string[];
  const { data: customers } = customerIds.length ? await supabase.from("customers").select("id, name").in("id", customerIds) : { data: [] };
  const customerMap = new Map((customers ?? []).map((c) => [c.id, c]));

  const rows = list.map((c) => {
    const customer = c.customer_id ? customerMap.get(c.customer_id) : undefined;
    return {
      ...c,
      _customer_name: (customer as { name?: string } | undefined)?.name ?? null,
    };
  });

  return (
    <ContactsClient initialData={rows} error={undefined} />
  );
}

