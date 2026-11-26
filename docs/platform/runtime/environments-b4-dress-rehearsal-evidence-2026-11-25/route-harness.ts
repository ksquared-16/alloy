// B4 rehearsal only: the candidate's own route handlers for /api/build-info and /api/scheduled-work/wake, served on
// 127.0.0.1 so the step-11/14/15 observations read the real code instead of a hand-written JSON file. It is not the
// app (no Next server, no pages): the two GET/POST exports, called with a NextRequest built from the incoming request.
// The rehearsal copies this file into the scratch candidate worktree's web/scripts/ and runs it with
// `tsx --tsconfig tsconfig.json`; the environment is what the deployment under test would carry.
// It logs each request's method, path and which credential headers were present (never their values).
// Usage: tsx route-harness.ts <port|0> <port-file> <request-log>
import http from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";
import { NextRequest } from "next/server";
import * as buildInfo from "@/app/api/build-info/route";
import * as wake from "@/app/api/scheduled-work/wake/route";

const [port, portFile, requestLog] = process.argv.slice(2);

const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const method = req.method ?? "GET";
    const request = new NextRequest(url, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks) });
    let r: Response;
    try {
        if (url.pathname === "/api/build-info" && method === "GET") r = buildInfo.GET();
        else if (url.pathname === "/api/scheduled-work/wake" && method === "POST") r = await wake.POST(request);
        else if (url.pathname === "/api/scheduled-work/wake" && method === "GET") r = await wake.GET(request);
        else r = new Response("not served by the rehearsal harness", { status: 404 });
    } catch (e) {
        r = new Response(String(e), { status: 599 });
    }
    const body = Buffer.from(await r.arrayBuffer());
    appendFileSync(requestLog, `${JSON.stringify({
        at: new Date().toISOString(), method, path: url.pathname,
        authorization: req.headers.authorization ? (req.headers.authorization.startsWith("Bearer ") ? "bearer" : "other") : "absent",
        x_cron_token: req.headers["x-cron-token"] ? "present" : "absent",
        status: r.status,
    })}\n`);
    res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
    res.end(body);
});
server.listen(Number(port) || 0, "127.0.0.1", () => {
    const a = server.address();
    writeFileSync(portFile, String(typeof a === "object" && a ? a.port : ""));
});
