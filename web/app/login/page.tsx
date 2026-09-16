"use client";

import { useState, FormEvent, Suspense, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

import { createClient } from "@/lib/supabaseClient";
import { getPublicSupabaseAuthDebug } from "@/lib/supabase/publicAuthEnv";
import CTAButton from "@/components/marketing/CTAButton";
import PasswordField from "@/components/auth/PasswordField";
import { signInErrorMessage } from "@/lib/auth/signInErrorMessage";
import { authCookieNameFor, browserSupabaseUrl } from "@/lib/supabase/browserTransport";
import { MARKETING_BRAND } from "@/lib/marketing/artifactPaths";

/**
 * Ask the server for its Supabase configuration, and keep it for the stale-bundle repair below.
 *
 * WHAT THIS USED TO BE. A visible panel on the login page printing the environment variable, the
 * parsed origin, and a line instructing the reader which URL their sign-in would POST to. On a
 * certification server that origin is a loopback address on the HOST, and the panel therefore told
 * a remote operator their browser should call the host's own loopback address. It was wrong on the facts as well as out of place: the browser client
 * rewrites a loopback URL to this app's own origin precisely so a remote browser is never sent to
 * its own machine. Operator-facing copy that names an internal address is a defect even when the
 * address is accurate server-side, and this one actively misdirected an operator for a full round
 * of QA.
 *
 * WHAT SURVIVES, AND WHY. The fetch does. It is not a diagnostic — it is the input to the repair in
 * `handleSubmit`, which prefers the server's configuration when this bundle was compiled against an
 * older one. That failure is real and was expensive twice. The diagnostics now live at
 * `/dev/supabase-connectivity`, which nobody signing in will ever see.
 */
function useServerSupabaseConfig(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/dev/supabase-origin", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        if (j?.url && j?.anonKey) setServerSupabaseConfig({ url: j.url as string, anonKey: j.anonKey as string });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);
}

/** Where a signed-in operator belongs. Named once so the two paths here cannot drift apart. */
const POST_SIGN_IN_PATH = "/workspace";

/**
 * THE SERVER'S OWN SUPABASE CONFIG, WHEN THIS BUNDLE'S IS STALE.
 *
 * A dev server can serve a client bundle compiled against an older environment. When that happened,
 * sign-in posted at a Supabase that was not running and the page reported "Email or password is
 * incorrect" -- so a correct password looked wrong, for hours, twice over.
 *
 * The bundle cannot fix its own inlined value, but it can ask the server what the value should be
 * and use THAT. Development only, and only when the two actually disagree: a normal dev session
 * never takes this path, and production has no route to ask.
 */
let serverSupabaseConfig: { url: string; anonKey: string } | null = null;
function setServerSupabaseConfig(c: { url: string; anonKey: string }) {
  serverSupabaseConfig = c;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isDev = process.env.NODE_ENV === "development";
  useServerSupabaseConfig(isDev);
  // Origin only — the debug helper never exposes key material.
  const supabaseOrigin = isDev ? getPublicSupabaseAuthDebug().origin : null;

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

  /*
   * ALREADY SIGNED IN? Then this page is a trap, not a service.
   *
   * The session cookie is `domain=localhost` with NO port, so it is shared by every dev server on
   * this machine. Signing in on one port signs you in on all of them -- but /login still rendered a
   * form, so an already-authenticated operator arriving here sees a login screen, concludes the app
   * has signed them out, and starts typing. That cost an afternoon: every route they actually wanted
   * was serving them 200 the entire time.
   *
   * `getUser()` and not `getSession()`. getSession reads the cookie locally and will happily return a
   * session the middleware then rejects, which sends the browser back here -- a redirect loop built
   * out of two components that each behave reasonably. getUser asks the auth server, so a redirect
   * only happens when the session is one the rest of the app will also accept.
   *
   * `error=unauthorized` is excluded for the same reason from the other direction: that state means
   * the caller IS authenticated and lacks ACCESS. Bouncing them to the workspace would return them
   * here immediately, and the message explaining the problem would never be readable.
   */
  useEffect(() => {
    if (errorParam === "unauthorized") return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        if (!cancelled && data.user) router.replace(POST_SIGN_IN_PATH);
      } catch {
        // No session, or no reachable auth service. Either way the form is the right thing to show.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [errorParam, router]);

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
      /*
       * Prefer the SERVER's configuration when this bundle's disagrees with it. The stale half is
       * always the bundle -- the server read its environment moments ago, the bundle was compiled
       * whenever it was compiled -- so trusting the server is trusting the fresher of the two.
       */
      const clientOrigin = getPublicSupabaseAuthDebug().origin;
      const useServerConfig =
        isDev
        && serverSupabaseConfig !== null
        && clientOrigin !== null
        && (() => {
          try {
            return new URL(serverSupabaseConfig!.url).origin !== clientOrigin;
          } catch {
            return false;
          }
        })();

      /*
       * THE REPAIR MUST NOT UNDO THE TRANSPORT RULE.
       *
       * This constructed the client from the server's raw URL. On a certification host that URL is
       * loopback, so the repair aimed a REMOTE operator's browser at its own machine — unreachable,
       * and with the library's derived cookie name rather than the pinned one, so even a successful
       * sign-in would have written a cookie middleware does not read. The stale-bundle problem is
       * about WHICH PROJECT to sign in to; it was never about where the browser sends the request.
       * `browserSupabaseUrl` and `authCookieNameFor` own that, here as everywhere else.
       */
      const supabase = useServerConfig
        ? createBrowserClient(
            browserSupabaseUrl(serverSupabaseConfig!.url, window.location.origin),
            serverSupabaseConfig!.anonKey,
            (() => {
              const name = authCookieNameFor(serverSupabaseConfig!.url);
              return name ? { cookieOptions: { name } } : undefined;
            })(),
          )
        : createClient();
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

      router.push(POST_SIGN_IN_PATH);
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
              {/*
                Dev only, and only under the credential answer — the one message that is deliberately
                ambiguous. Accounts are per-project, and an operator running a local server against a
                hosted project will present a password that is entirely correct somewhere else and be
                told it is incorrect. That cost a QA gate an afternoon.

                It does NOT weaken W-32. This names the environment, never the account: it says the
                same words for an address that exists here and one that does not, so it is no more an
                existence oracle than the URL in the address bar. It is the same carve-out the message
                module already makes for `misconfigured` and `unreachable` — true of every caller,
                silent about all of them.
              */}
              {isDev && error === signInErrorMessage(null) ? (
                <p className="mt-2 border-t border-red-200 pt-2 text-xs text-red-700/80">
                  This server signs in against its own non-production database. Accounts are per
                  environment — one from another environment will not work here.
                </p>
              ) : null}
            </div>
          )}

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
