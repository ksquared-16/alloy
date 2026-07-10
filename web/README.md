This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Type checking & tests

Run all commands from `web/`.

| Command | Scope | Approx. warm time |
| --- | --- | --- |
| `npm run typecheck` | **Production/build graph** (`tsconfig.build.json` — same config `next build` uses). App + API + `lib/`; excludes tests, scripts, Playwright. **Canonical pre-merge check.** | ~1.5 min warm |
| `npm run typecheck:build` | Alias for `npm run typecheck` (production/build graph). | ~1.5 min warm |
| `npm run typecheck:tests` | **Full graph** (`tsconfig.json`): production + tests + scripts + Playwright. Use when changing test or script TypeScript. | ~3–5 min warm |
| `npm run test` | Vitest run over `tests/**`. | ~2 min wall |

Notes:

- All typecheck scripts use an **8 GB Node heap** and are **incremental** with separate `tsconfig.tsbuildinfo` / `tsconfig.build.tsbuildinfo` files.
- First run after a large change is slower than subsequent runs.
- These are large, `strict` TypeScript projects (~6.8k program files). `tsc` is CPU-bound — avoid running multiple full type checks at once.
- **Do not use raw `npx tsc --noEmit`** — it skips the heap override and may OOM. See `docs/governance/typescript-performance.md`.
- **Do not leave background `tsc`/`vitest`/`next dev` processes running.** Several concurrent `tsc` processes will starve CPU/RAM. Close unused Cursor worktrees when possible.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
