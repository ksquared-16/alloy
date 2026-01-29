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
  }

  return (
    <ContactsClient initialData={contacts || []} error={error?.message} />
  );
}

