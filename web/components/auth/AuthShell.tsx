import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

import { MARKETING_BRAND } from "@/lib/marketing/artifactPaths";

/**
 * The branded two-column frame shared by the unauthenticated account pages: sign in, forgot password and
 * reset password (F-1, Access & Roles V3). Before this, `/login` carried the brand panel inline and the two
 * recovery pages used an older centred card with a different palette, so leaving sign-in to recover a
 * password looked like leaving the product.
 *
 * Markup only — no state, no auth calls. Each page keeps its own behaviour and error discipline.
 */

/** Input styling for these pages. One definition so the three forms cannot drift apart. */
export const AUTH_INPUT_CLASS =
    "w-full rounded-lg border border-alloy-forge/15 bg-white px-4 py-3 text-sm text-alloy-forge placeholder:text-alloy-forge/40 focus:border-alloy-juniper focus:outline-none focus:ring-2 focus:ring-alloy-juniper/20";

export const AUTH_LABEL_CLASS = "mb-1.5 block text-sm font-medium text-alloy-forge/80";

export const AUTH_LINK_CLASS = "font-medium text-alloy-juniper hover:underline";

export default function AuthShell({ children }: { children: ReactNode }) {
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

            {/* Form column */}
            <main className="flex w-full flex-1 flex-col justify-center bg-white px-6 py-12 sm:px-10 lg:w-1/2 lg:px-16 xl:px-24">
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
                    {children}
                </div>
            </main>
        </div>
    );
}

/** The error box the sign-in page already used, announced to assistive tech when it appears. */
export function AuthAlert({ children, id }: { children: ReactNode; id?: string }) {
    return (
        <div id={id} role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {children}
        </div>
    );
}
