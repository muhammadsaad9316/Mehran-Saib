import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email or student roll number").fill("fixture@example.test");
  await page.getByLabel("Password", { exact:true }).fill("FixtureTeacher2026!");
  await page.getByRole("button", { name:"Sign in",exact:true }).click();
  await expect(page.getByRole("button", { name:/^Check tasks(?: \d+)?$/ })).toBeVisible();
}
async function compare(page: Page) {
  await page.getByRole("button", { name:/^Check tasks(?: \d+)?$/ }).click();
  await page.getByRole("button", { name:"Compare",exact:true }).first().click();
  await expect(page.getByRole("region",{name:"Side by side task comparison"})).toBeVisible();
  await expect(page.getByLabel("Roll 1 marks")).toBeEnabled();
}

test("student blocks show immediate identity tooltips on hover, focus and touch without overflowing", async ({page}, info) => {
  await signIn(page);
  const matrix = page.getByRole("group", { name: /^Reliability fixture: .*Each block/ });
  const first = matrix.getByRole("button", { name: /^Roll no\. 1: Fixture student 1, / });
  const last = matrix.getByRole("button", { name: "Roll no. 41: Fixture student 41, No submission", exact: true });
  if (info.project.name === "mobile") await first.tap(); else await first.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible({timeout:500});
  await expect(tooltip).toContainText("Fixture student 1");
  await expect(tooltip).toContainText(/Roll no\. 1 · (Awaiting review|Graded submissions)/);
  await expect(first).not.toHaveAttribute("title");
  const appearance = await first.evaluate(element => {
    const style = getComputedStyle(element);
    return { cursor: style.cursor, outlineStyle: style.outlineStyle, outlineOffset: style.outlineOffset, transform: style.transform };
  });
  expect(appearance.cursor).toBe("pointer");
  if (appearance.outlineStyle !== "none") expect(Number.parseFloat(appearance.outlineOffset)).toBeLessThanOrEqual(0);
  expect(appearance.transform).toBe("none");
  if (info.project.name === "desktop") {
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await last.focus();
  await expect(tooltip).toContainText("Fixture student 41");
  expect(await last.evaluate(element => Number.parseFloat(getComputedStyle(element).outlineOffset))).toBeLessThanOrEqual(0);
  const box = await tooltip.boundingBox();
  const bounds = await matrix.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/student-tooltip-${info.project.name}.png`});
  await page.getByRole("heading", {name:/^Lab overview/}).click();
  await expect(tooltip).toBeHidden();
});

test("selected revision renders protected source/images with bounded asset requests and responsive layout", async ({page})=>{
  let active=0, maximum=0, completed=0;
  await page.route("**/api/submissions/fixture-submission-1/files/**",async route=>{
    active++;maximum=Math.max(maximum,active);
    await new Promise(resolve=>setTimeout(resolve,50));
    const response=await route.fetch();active--;completed++;
    await route.fulfill({response});
  });
  await signIn(page);await compare(page);
  const frame=page.frameLocator('iframe[title="Roll 1 project preview"]');
  await expect(frame.getByRole("heading",{name:"Fixture page",exact:true})).toBeVisible();
  await expect.poll(()=>completed).toBe(9);
  expect(maximum).toBeLessThanOrEqual(4);
  await expect(frame.getByAltText("Fixture image")).toHaveJSProperty("complete",true);
  expect(await frame.getByAltText("Fixture image").evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test("comparison guards dirty panes and blocks leaving while a save is pending", async ({page})=>{
  await signIn(page);await compare(page);
  const left=page.getByLabel("Roll 1 marks"),right=page.getByLabel("Roll 2 feedback");
  await left.fill(String((Number(await left.inputValue())+1)%10));
  await right.fill("Unsaved comparison fixture feedback");
  page.once("dialog",dialog=>dialog.dismiss());
  await page.getByRole("button",{name:"Back to tasks",exact:true}).click();
  await expect(right).toHaveValue("Unsaved comparison fixture feedback");
  let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/submissions/fixture-submission-1/grade",async route=>{await gate;await route.continue();});
  await page.getByRole("article",{name:"Roll 1 task",exact:true}).getByRole("button",{name:"Save grade",exact:true}).click();
  await expect(left).toBeDisabled();
  await page.getByRole("button",{name:"Back to tasks",exact:true}).click();
  await expect(page.getByRole("region",{name:"Side by side task comparison"})).toBeVisible();
  release();await expect(left).toBeEnabled();
  await expect(right).toHaveValue("Unsaved comparison fixture feedback");
  page.once("dialog",dialog=>dialog.dismiss());
  await page.getByRole("button",{name:"Labs",exact:true}).click();
  await expect(right).toHaveValue("Unsaved comparison fixture feedback");
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("button",{name:"Back to tasks",exact:true}).click();
  await expect(page.getByRole("region",{name:"Side by side task comparison"})).toBeHidden();
});

test("an acknowledged lab save closes the form when refresh fails and reports the saved outcome",async({page},info)=>{
  await signIn(page);
  let saved=false,writes=0;
  await page.route("**/api/labs",async route=>{
    if(route.request().method()!=="POST"){await route.continue();return;}
    writes++;const response=await route.fetch();saved=response.ok();await route.fulfill({response});
  });
  await page.route("**/api/state",async route=>{
    if(saved)await route.fulfill({status:503,json:{error:"Fixture refresh failure"}});else await route.continue();
  });
  await page.getByRole("button",{name:"Create a lab",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByLabel("Lab title").fill(`Saved fixture ${info.project.name}`);
  await dialog.getByLabel("Lab title").press("Tab");
  expect(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await dialog.getByRole("button",{name:"Save draft",exact:true}).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("alert")).toContainText("The lab was saved, but the workspace could not refresh.");
  expect(writes).toBe(1);
});
