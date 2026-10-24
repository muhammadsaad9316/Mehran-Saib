import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function teacher(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email or student roll number").fill("fixture@example.test");
  await page.getByLabel("Password", { exact:true }).fill("FixtureTeacher2026!");
  await page.getByRole("button", { name:"Sign in",exact:true }).click();
  await expect(page.getByRole("button", { name:/^Check tasks(?: \d+)?$/ })).toBeVisible();
}
async function compare(page: Page) {
  await page.getByRole("button", { name:/^Check tasks(?: \d+)?$/ }).click();
  await page.getByRole("button", { name:"Compare",exact:true }).first().click();
  await expect(page.getByLabel("Roll 1 marks")).toBeEnabled();
}
async function work(page: Page, id="fixture-submission-1") {
  return (await (await page.request.get("/api/state")).json()).submissions.find((item:{id:string})=>item.id===id);
}
async function otherGrade(page: Page, marks:number) {
  const current=await work(page);
  const response=await page.request.patch(`/api/submissions/${current.id}/grade`,{data:{marks,feedback:"Changed from another tab",published:true,revision:current.revision,expectedGradeAt:current.grade?.gradedAt||""}});
  expect(response.ok()).toBe(true);
}

test("comparison drafts keep their original grade guard through another pane's refresh and conflicts", async ({page})=>{
  await teacher(page); await compare(page);
  const left=page.getByRole("article",{name:"Roll 1 task",exact:true}), right=page.getByRole("article",{name:"Roll 2 task",exact:true});
  await page.getByLabel("Roll 1 marks").fill("4");
  await otherGrade(page,9);
  await page.getByLabel("Roll 2 marks").fill("6");
  await right.getByRole("button",{name:"Save grade",exact:true}).click();
  await expect(right.getByRole("button",{name:"Save grade",exact:true})).toBeEnabled();
  for(let attempt=0;attempt<2;attempt++) {
    const response=page.waitForResponse(r=>r.url().endsWith("/fixture-submission-1/grade")&&r.request().method()==="PATCH");
    await left.getByRole("button",{name:"Save grade",exact:true}).click();
    expect((await response).status()).toBe(409);
    await expect(left.getByRole("alert")).toContainText("Close and reopen");
    await expect(left.getByRole("button",{name:"Save grade",exact:true})).toBeEnabled();
    expect((await work(page)).grade.marks).toBe(9);
  }
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("button",{name:"Back to tasks",exact:true}).click();
  await page.getByRole("button",{name:"Compare",exact:true}).first().click();
  await expect(page.getByLabel("Roll 1 marks")).toHaveValue("9");
  for(const marks of [8,7]) {
    await page.getByLabel("Roll 1 marks").fill(String(marks));
    await left.getByRole("button",{name:"Save grade",exact:true}).click();
    await expect(left.getByRole("button",{name:"Save grade",exact:true})).toBeEnabled();
    expect((await work(page)).grade.marks).toBe(marks);
  }
});

test("individual review cannot rebase a stale grade after its conflict refresh", async ({page})=>{
  await teacher(page);
  await otherGrade(page,7);
  await page.reload();
  await page.getByRole("button",{name:/^Check tasks(?: \d+)?$/}).click();
  await page.getByRole("button",{name:"Edit grade",exact:true}).first().click();
  const dialog=page.getByRole("dialog",{name:"Review submission",exact:true});
  const marks=dialog.getByRole("spinbutton");
  await expect(marks).toHaveValue("7");
  await expect(marks).toBeFocused();
  await marks.fill("2");
  await otherGrade(page,3);
  for(let attempt=0;attempt<2;attempt++) {
    const response=page.waitForResponse(r=>r.url().endsWith("/fixture-submission-1/grade")&&r.request().method()==="PATCH");
    await dialog.locator(".review-save-next-btn").click();
    expect((await response).status()).toBe(409);
    await expect(dialog.getByText(/Close and reopen this review/)).toBeVisible();
    await expect(dialog.locator(".review-save-next-btn")).toBeEnabled();
    expect((await work(page)).grade.marks).toBe(3);
  }
});

test("lab drafts confirm every dismissal, warn on page exit and block leaving during save",async({page},info)=>{
  await teacher(page);
  const create=page.getByRole("button",{name:"Create a lab",exact:true}).first();
  await create.click();
  const editor=page.getByRole("dialog").filter({has:page.getByRole("heading",{name:"Create a lab",exact:true})});
  await expect(editor.getByLabel("Lab title",{exact:true})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await create.click();
  const title=editor.getByLabel("Lab title",{exact:true});
  await title.fill(`Guarded draft ${info.project.name}`);
  for(const action of [()=>page.keyboard.press("Escape"),()=>editor.getByRole("button",{name:"Cancel",exact:true}).click(),()=>editor.getByRole("button",{name:"Close lab editor",exact:true}).click(),()=>page.locator(".modal-overlay").click({position:{x:2,y:2}})]) {
    page.once("dialog",dialog=>dialog.dismiss());
    await action();
    await expect(title).toHaveValue(`Guarded draft ${info.project.name}`);
  }
  expect(await page.evaluate(()=>{const e=new Event("beforeunload",{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})).toBe(true);
  let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/labs",async route=>{await gate;await route.continue();});
  try {
    await editor.getByRole("button",{name:"Save draft",exact:true}).click();
    await expect(title).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.locator(".modal-overlay").click({position:{x:2,y:2}});
    await expect(editor).toBeVisible();
    expect(await page.evaluate(()=>window.dispatchEvent(new Event("labtrack:before-navigate",{cancelable:true})))).toBe(false);
    release();
    await expect(editor).toBeHidden();
  } finally {release();}
  await create.click();
  await editor.getByLabel("Lab title",{exact:true}).fill("Discard me");
  page.once("dialog",dialog=>dialog.accept());
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
});

test("login defers portal, review and editor modules and styles until needed",async({page})=>{
  const requested:string[]=[];
  page.on("request",request=>{requested.push(new URL(request.url()).pathname);});
  await page.goto("/");
  await expect(page.getByRole("button",{name:"Sign in",exact:true})).toBeVisible();
  expect(requested.some(url=>/\/(Review|LabEditor|TeacherPortal|StudentPortal|portal)-.*\.(js|css)$/.test(url))).toBe(false);
  await teacher(page);
  expect(requested.some(url=>/\/portal-.*\.css$/.test(url))).toBe(true);
});

test("pending and failed analysis never labels similarity clean",async({page})=>{
  await teacher(page);
  let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/labs/fixture-lab/analysis?*",async route=>{
    await gate;
    await route.fulfill({status:503,json:{error:"Analysis unavailable in this fixture"}});
  });
  try {
    await page.getByRole("button",{name:/^Check tasks(?: \d+)?$/}).click();
    const similarity=page.locator("tr.task-row-clickable").first().locator("td").nth(4);
    await expect(similarity).toHaveText("Checking…");
    await expect(page.locator(".task-match-badge.match-clean")).toHaveCount(0);
    release();
    await expect(page.getByRole("alert")).toHaveText("Analysis unavailable in this fixture");
    await expect(similarity).toHaveText("Unavailable");
    await expect(page.locator(".task-match-badge.match-clean")).toHaveCount(0);
  } finally {release();}
});

test("incomparable evidence requests manual review in the queue and individual review",async({page})=>{
  await teacher(page);
  await page.route("**/api/labs/fixture-lab/analysis?*",async route=>{
    const response=await route.fetch();const data=await response.json();
    data.submissions=data.submissions.map((item:object)=>({...item,comparable:false}));
    data.pairs=data.pairs.map((item:object)=>({...item,comparable:false}));
    await route.fulfill({response,json:data});
  });
  await page.route("**/api/submissions/*/analysis?*",async route=>{
    const response=await route.fetch();const data=await response.json();
    data.similarities=data.similarities.map((item:object)=>({...item,comparable:false}));
    await route.fulfill({response,json:data});
  });
  await page.getByRole("button",{name:/^Check tasks(?: \d+)?$/}).click();
  await expect(page.locator("tr.task-row-clickable").first().locator("td").nth(4)).toHaveText("Needs manual review");
  await expect(page.locator(".task-match-badge.match-clean")).toHaveCount(0);
  await page.locator("tr.task-row-clickable").first().getByRole("button",{name:/^(Grade|Edit grade)$/}).click();
  const metric=page.getByRole("button",{name:"No comparable peer submissions",exact:true});
  await expect(metric).toContainText("Needs manual review");
  await expect(metric).not.toHaveClass(/metric-clean/);
  await expect(metric).toBeDisabled();
  expect(await metric.locator(".metric-note").evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
});

test("completed comparable evidence keeps low-match clean labels and valid comparison access",async({page})=>{
  await teacher(page);
  await page.route("**/api/labs/fixture-lab/analysis?*",async route=>{
    const response=await route.fetch();const data=await response.json();
    data.pairs=data.pairs.map((item:object)=>({...item,percentage:25}));
    await route.fulfill({response,json:data});
  });
  await page.getByRole("button",{name:/^Check tasks(?: \d+)?$/}).click();
  await expect(page.locator("tr.task-row-clickable").first().locator("td").nth(4)).toHaveText("Clean");
  await page.unroute("**/api/labs/fixture-lab/analysis?*");
  await page.getByRole("button",{name:"Refresh task submissions",exact:true}).click();
  await expect(page.locator("tr.task-row-clickable").first().locator("td").nth(4)).toContainText("Match");
  await page.getByRole("button",{name:"Compare",exact:true}).first().click();
  await expect(page.getByRole("region",{name:"Side by side task comparison"})).toBeVisible();
});

test("students download instruction bytes only when opening the handout",async({page})=>{
  await teacher(page);
  const state=await(await page.request.get("/api/state")).json();
  const original=state.labs.find((lab:{id:string})=>lab.id==="fixture-lab");
  const bytes="Isolated browser handout bytes";
  await page.request.patch("/api/labs/fixture-lab",{data:{...original,instructionFile:{name:"fixture-brief.txt",contentType:"text/plain",content:Buffer.from(bytes).toString("base64")}}});
  try {
    await page.request.post("/api/auth/login",{data:{email:"1",password:"FixtureTeacher2026!"}});
    const fetched:string[]=[];
    page.on("request",request=>{if(request.url().includes("/instructions?"))fetched.push(request.url());});
    await page.reload();
    await page.getByRole("button",{name:"Open Lab 1: Reliability fixture",exact:true}).click();
    expect(fetched.length).toBe(0);
    const download=page.waitForEvent("download");
    await page.getByRole("link",{name:"Download instructions",exact:true}).click();
    const result=await download;
    expect(result.suggestedFilename()).toBe("fixture-brief.txt");
    expect(await readFile((await result.path())!,"utf8")).toBe(bytes);
    expect(result.url()).toContain("/api/labs/fixture-lab/instructions?revision=");
  } finally {
    await page.request.post("/api/auth/login",{data:{email:"fixture@example.test",password:"FixtureTeacher2026!"}});
    const latest=(await(await page.request.get("/api/state")).json()).labs.find((lab:{id:string})=>lab.id==="fixture-lab");
    await page.request.patch("/api/labs/fixture-lab",{data:{revision:latest.revision,instructionFile:original.instructionFile||null}});
  }
});
