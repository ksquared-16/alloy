"use client";

import { useState, FormEvent, Suspense, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { getPublicSupabaseAuthDebug } from "@/lib/supabase/publicAuthEnv";
import CTAButton from "@/components/marketing/CTAButton";
import PasswordField from "@/components/auth/PasswordField";
import { signInErrorMessage } from "@/lib/auth/signInErrorMessage";
import { MARKETING_BRAND } from "@/lib/marketing/artifactPaths";

/** Dev-only: safe Supabase connectivity hints (hostname + booleans only). */
function DevSupabaseAuthPanel() {
  const d = getPublicSupabaseAuthDebug();
  return (
    <div
      className="mb-4 rounded-md border border-alloy-forge/10 bg-alloy-stone/50 px-3 py-2 text-left text-[11px] leading-relaxed text-alloy-forge/80 font-mono"
      data-testid="login-supabase-env-debug"
    >
      <div className="mb-1 font-sans font-semibold text-alloy-forge">Dev: Supabase connectivity</div>
      <div>NEXT_PUBLIC_SUPABASE_URL defined: {d.urlDefined ? "yes" : "no"}</div>
      <div>Origin: {d.origin ?? "(none — check URL)"}</div>
      <div>URL parses: {d.urlParseError ? `no (${d.urlParseError})` : d.urlDefined ? "yes" : "n/a"}</div>
      <div>NEXT_PUBLIC_SUPABASE_ANON_KEY defined: {d.anonKeyDefined ? "yes" : "no"}</div>
      <div className="mt-1 break-all">
        {/* The whole URL, straight from the parsed origin. Never rebuilt from
            scheme + hostname: that is what invented an https URL with no port
            and sent a certification run chasing a defect that did not exist. */}
        Password sign-in expects: {d.authTokenUrl ? `POST ${d.authTokenUrl}` : "(set URL to see)"}
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (!isDev) return;
    const d = getPublicSupabaseAuthDebug();
    console.info("[login] Supabase public auth env (origin only, no key material)", {
      NEXT_PUBLIC_SUPABASE_URL_defined: d.urlDefined,
      supabase_origin: d.origin ?? "(unset or unparsable)",
      NEXT_PUBLIC_SUPABASE_ANON_KEY_defined: d.anonKeyDefined,
      url_parse_error: d.urlParseError,
      scheme: d.scheme,
      port: d.port ?? "(scheme default)",
      password_sign_in_path: d.expectedAuthTokenPath,
      expected_fetch_url: d.authTokenUrl ? `POST ${d.authTokenUrl}` : null,
    });
  }, [isDev]);

  const errorParam = searchParams?.get("error");

  const hasClientEnvVars = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const initialError =
    errorParam === "unauthorized"
      ? "You are not authorized to access the admin area."
      : errorParam === "config" && !hasClientEnvVars
        ? "Configuration error: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
        : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      // W-32 / `I-33` — the provider's own words never reach the screen. `Email not confirmed` and
      // friends are account-existence oracles for any address an attacker chooses to type, so an
      // unrecognised provider string falls to the credential answer rather than being passed
      // through. Environment misconfiguration is still reported, because it is true of every caller
      // and says nothing about an account.
      if (signInError) {
        setError(signInErrorMessage(signInError));
        return;
      }

      if (!data.user) {
        setError(signInErrorMessage(null));
        return;
      }

      router.push("/workspace");
      router.refresh();
    } catch (err: unknown) {
      setError(signInErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-alloy-forge/15 bg-white px-4 py-3 text-sm text-alloy-forge placeholder:text-alloy-forge/40 focus:border-alloy-juniper focus:outline-none focus:ring-2 focus:ring-alloy-juniper/20";

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-0 flex-1 overflow-hidden bg-alloy-stone lg:block lg:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-br from-alloy-stone via-white to-alloy-juniper/5" />
        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <Link href="/">
            <Image
              src="/marketing/brand/alloy-gradient-wordmark.svg"
              alt="Alloy"
              width={160}
              height={40}
              className="h-9 w-auto"
            />
          </Link>
          <div className="flex flex-1 items-center justify-center py-12">
            <div className="relative aspect-[4/3] w-full max-w-md">
              <Image
                src={MARKETING_BRAND.brandmark}
                alt=""
                fill
                className="object-contain"
                aria-hidden
                priority
              />
            </div>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-alloy-midnight-forge/55">
            Most software stores information. Alloy moves work forward.
          </p>
        </div>
      </div>

      {/* Login form */}
      <div className="flex w-full flex-1 flex-col justify-center bg-white px-6 py-12 sm:px-10 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/">
              <Image
                src="/marketing/brand/alloy-gradient-wordmark.svg"
                alt="Alloy"
                width={140}
                height={36}
                className="h-8 w-auto"
              />
            </Link>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-alloy-forge md:text-3xl">
            Welcome back to Alloy.
          </h1>
          <p className="mt-2 text-sm text-alloy-forge/60">
            Sign in to your workspace.{" "}
            <Link href="/" className="font-medium text-alloy-juniper hover:underline">
              Back to homepage
            </Link>
          </p>

          {(error || initialError) && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error || initialError}
            </div>
          )}

          {isDev ? <div className="mt-6">{DevSupabaseAuthPanel()}</div> : null}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-alloy-forge/80">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            {/* W-30 — the show/hide baseline, from the one shared component (`RL-37`). */}
            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              required
              className={`${inputClass} pr-16`}
              placeholder="••••••••"
              autoComplete="current-password"
            />

            <CTAButton type="submit" disabled={isLoading} className="w-full">
              {isLoading ? "Signing in…" : "Sign in"}
            </CTAButton>

            <p className="text-center text-sm text-alloy-forge/60">
              <Link href="/forgot-password" className="text-alloy-juniper hover:underline">
                Forgot password?
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md text-center">
        <p className="text-alloy-forge/60">Loading…</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
