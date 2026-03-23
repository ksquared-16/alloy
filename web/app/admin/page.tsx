import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Redirect to dashboard
  redirect("/admin/dashboard");
}

