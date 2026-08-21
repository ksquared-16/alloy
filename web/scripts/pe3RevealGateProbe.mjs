/** Reveal-gate timeline across a real Firefly child-to-child switch. */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE=`http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE=join(homedir(),".local/state/alloy-dev/auth/slot5/storage-state.json");
const b=await chromium.launch({headless:true});
const c=await b.newContext({storageState:STORAGE,viewport:{width:1440,height:960}});
const p=await c.newPage();
const net=[]; p.on("request",r=>{const u=r.url(); if(u.includes("provisioning-answer")||u.includes("view-models/drawer")) net.push({t:Date.now(),u:u.replace(BASE,"").slice(0,80)});});
await p.goto(`${BASE}/workspace`,{waitUntil:"domcontentloaded",timeout:120000});
await p.waitForFunction(()=>document.querySelectorAll('a[href^="/workspace/work-unit/"]').length>0,{timeout:90000});
await p.waitForTimeout(30000);
await p.locator('a[href^="/workspace/work-unit/waitlist"]').first().click({timeout:20000});
await p.waitForTimeout(15000);
const rows=await p.evaluate(()=>[...document.querySelectorAll("[data-entity-id]")].map(e=>({id:e.getAttribute("data-entity-id"),name:(e.innerText||"").trim().split("\n").map(x=>x.trim()).filter(x=>x.length>2)[0]})));
const lennon=rows.find(r=>/Lennon/i.test(r.name||"")), wrigley=rows.find(r=>/Wrigley/i.test(r.name||""));
const gate=()=>p.evaluate(()=>({events:(window.__ALLOY_REVEAL_GATE_DIAG__||[]).slice(-14)}));
const state=()=>p.evaluate(()=>({
  hdr:document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim().split("\n")[0],
  preparing:[...document.querySelectorAll("[data-focus-panel-cell-preparing]")].map(e=>e.getAttribute("data-focus-panel-cell-preparing")),
}));
async function sw(target,label){
  await p.evaluate(()=>{window.__ALLOY_REVEAL_GATE_DIAG__=[];});
  const n0=net.length; const t0=Date.now();
  await p.locator(`[data-entity-id="${target.id}"]`).first().click({timeout:15000});
  let tMission=null;
  for(let i=0;i<300;i++){const s=await state();
    if(tMission===null && s.hdr===target.name && !s.preparing.includes("current_work")) tMission=Date.now()-t0;
    if(tMission) break; await p.waitForTimeout(60);}
  await p.waitForTimeout(2500);
  const g=await gate();
  console.log(`\n>>> ${label}  mission=${tMission}ms  net+${net.length-n0}`);
  g.events.forEach(e=>console.log(`    ${String(e.t).padStart(7)}ms ${e.event.padEnd(26)} active=${e.active}${e.detail?"  "+e.detail.slice(0,40):""}`));
}
await sw(wrigley,"Lennon -> Wrigley");
await sw(lennon,"Wrigley -> Lennon");
await b.close();
