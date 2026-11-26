// B3 rehearsal only: the Supabase API shape (/rest/v1, /auth/v1) in front of a throwaway PostgREST and GoTrue,
// so the operator commands talk to the local stand-in exactly as they would to https://<ref>.supabase.co.
// Listens on 127.0.0.1 only. Usage: node api-proxy.mjs <rest-port> <auth-port> <port-file>
import http from "node:http";
import { writeFileSync } from "node:fs";

const [rest, auth, portFile] = process.argv.slice(2);
const server = http.createServer((req, res) => {
  const route = req.url.startsWith("/rest/v1") ? [rest, req.url.slice(8) || "/"] : req.url.startsWith("/auth/v1") ? [auth, req.url.slice(8) || "/"] : null;
  if (!route) { res.writeHead(404).end(); return; }
  const up = http.request({ host: "127.0.0.1", port: Number(route[0]), path: route[1], method: req.method, headers: { ...req.headers, host: "127.0.0.1" } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502).end(String(e)); });
  req.pipe(up);
});
server.listen(0, "127.0.0.1", () => writeFileSync(portFile, String(server.address().port)));
