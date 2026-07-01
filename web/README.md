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
| `npm run typecheck:build` | App + API routes only (`tsconfig.build.json`, same config `next build` uses). Excludes tests, scripts, Playwright. **Use this for day-to-day app type checks.** | ~3.5 min |
| `npm run typecheck` | Full project (`tsconfig.json`): app + tests + scripts. Use before merging shared/test changes. | ~5.5 min |
| `npm run test` | Vitest run over `tests/**`. | ~2 min wall |

Notes:

- Both typecheck configs are **incremental** and write separate `*.tsbuildinfo` files; the first run after a large change is slower than subsequent runs.
- These are large, `strict` TypeScript projects (~6k source files). `tsc` is CPU-bound, so avoid running multiple full type checks at once.
- **Do not leave background `tsc`/`vitest`/`next dev` processes running.** Several concurrent `tsc --noEmit` processes will starve CPU/RAM and make every terminal command feel slow. If commands are unexpectedly slow, check for and kill stale processes (e.g. `ps aux | grep tsc`).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
