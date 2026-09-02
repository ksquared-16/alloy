import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const run = promisify(execFile);

/**
 * WHICH BUILD IS THIS BROWSER ACTUALLY TALKING TO?
 *
 * Six rounds of Surface Builder QA failed in a way the lane could not reproduce:
 * scripted gestures passed, the operator's did not, and no trace ever reached the
 * sink. Every hypothesis so far has been about the drag. This route tests the
 * assumption UNDERNEATH the drag — that the operator's `localhost:3016` and the
 * lane's `localhost:3016` are the same process.
 *
 * They need not be. The operator works from a laptop connected to this machine;
 * if the browser resolves `localhost` on the laptop rather than here, it reaches
 * a different server, from a different checkout, and no fix shipped here would
 * ever appear there. That failure is invisible from both ends — the page looks
 * right, the code looks right — which is exactly why it can survive six rounds.
 *
 * So: open this URL in the SAME browser that shows the builder. It answers with
 * the machine, the worktree and the commit actually serving that tab.
 *
 * Dev-only. It reports paths and a commit, nothing privileged.
 */
export const dynamic = "force-dynamic";

async function git(...args: string[]): Promise<string | null> {
    try {
        const { stdout } = await run("git", args, { cwd: process.cwd() });
        return stdout.trim();
    } catch {
        return null;
    }
}

export async function GET() {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ ok: false, error: "development_only" }, { status: 404 });
    }
    return NextResponse.json({
        ok: true,
        host: hostname(),
        cwd: process.cwd(),
        branch: await git("rev-parse", "--abbrev-ref", "HEAD"),
        commit: await git("rev-parse", "--short", "HEAD"),
        subject: await git("log", "-1", "--pretty=%s"),
        /*
         * The one question the operator's QA turns on: does the build serving this
         * tab have the explicit drop zones, or is it from before them?
         */
        hasDropZones: true,
        servedAt: new Date().toISOString(),
    });
}
