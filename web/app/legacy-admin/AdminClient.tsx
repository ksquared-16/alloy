"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import PrimaryButton from "@/components/PrimaryButton";

interface AdminClientProps {
  userEmail: string;
}

export default function AdminClient({ userEmail }: AdminClientProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-alloy-stone py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8 border border-alloy-stone/30">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-alloy-midnight mb-2">
                Admin (Staging)
              </h1>
              <p className="text-alloy-midnight/70">
                Signed in as: <span className="font-medium">{userEmail}</span>
              </p>
            </div>
            <PrimaryButton onClick={handleSignOut} className="!px-4 !py-2">
              Sign Out
            </PrimaryButton>
          </div>

          <div className="mt-8 p-6 bg-alloy-stone/20 rounded-lg border border-alloy-stone/30">
            <p className="text-alloy-midnight/80 text-sm">
              Admin dashboard coming soon. This is a placeholder page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

