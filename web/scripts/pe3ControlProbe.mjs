import http from "http";
const PORT = Number(process.env.PE3_PORT ?? 3015);
const N = Number(process.env.N ?? 21);
const once = () => new Promise((res, rej) => {
  const t = process.hrtime.bigint();
  const req = http.get({ host: "127.0.0.1", port: PORT, path: "/login", agent: false },
    (r) => { r.resume(); r.on("end", () => res(Number(process.hrtime.bigint() - t) / 1e6)); });
  req.on("error", rej);
});
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const a = [];
for (let i = 0; i < N; i++) { a.push(await once()); await new Promise((r) => setTimeout(r, 200)); }
const r = a.slice(1);
const p50 = q(r, .5), p75 = q(r, .75), max = Math.max(...r);
console.log(JSON.stringify({ n: r.length, p50: +p50.toFixed(2), p75: +p75.toFixed(2), max: +max.toFixed(2), p75_over_p50: +(p75 / p50).toFixed(3), max_over_p50: +(max / p50).toFixed(2) }));
