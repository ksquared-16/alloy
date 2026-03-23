import { createAdminClient } from "@/lib/supabaseAdmin";
import VerticalsClient from "./VerticalsClient";

export const dynamic = 'force-dynamic';

export default async function VerticalsPage() {
  const supabase = createAdminClient();

  const { data: verticals, error } = await supabase
    .from("verticals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Error fetching verticals:", error);
  }

  return (
    <VerticalsClient initialData={verticals || []} error={error?.message} />
  );
}

