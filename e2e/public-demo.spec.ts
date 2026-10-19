import { test, expect, type Page } from "@playwright/test";
import { publicDemoLogins } from "../shared/demo";

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/");
  await page.getByLabel("Email or student roll number").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
}

test("public demo login, fixed accounts, student upload and teacher review stay separate from the classroom", async ({ page, browser }, info) => {
  await login(page, publicDemoLogins.teacher);
  await expect(page.getByRole("note")).toContainText("Public demo");
  await page.getByRole("button", { name: "Students", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add student", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Open roll number 1", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Student profile" })).toContainText("Demo Student");
  await expect(page.getByRole("button", { name: "Save name", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, publicDemoLogins.student);
  await expect(page.getByRole("note")).toBeVisible();
  await page.getByRole("button", { name: "Open Lab 1: Build your first web page", exact: true }).click();
  const task = page.locator("details.student-task").filter({ hasText: "Style your page" });
  await task.locator("summary").focus();
  if (await task.getAttribute("open") !== null) await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(task).toHaveAttribute("open", "");
  await task.getByRole("button", { name: /^(?:Submit task|Resubmit task)$/ }).click();
  const upload = page.getByRole("dialog", { name: "Submit lab work" });
  await upload.getByLabel("Choose project files", { exact: true }).setInputFiles([
    { name: "index.html", mimeType: "text/html", buffer: Buffer.from(`<h1>Demo ${info.project.name} upload</h1>`) },
    { name: "style.css", mimeType: "text/css", buffer: Buffer.from("body { color: #264b35; }") },
  ]);
  await upload.getByRole("button", { name: /^(?:Submit task|Resubmit task)$/ }).click();
  await expect(upload).toBeHidden();
  await expect(task.getByText("Submitted", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/public-demo-student-${info.project.name}.png`, fullPage: true });

  const context = await browser.newContext({ viewport: info.project.use.viewport });
  try {
    const teacher = await context.newPage();
    await login(teacher, publicDemoLogins.teacher);
    await expect(teacher.getByRole("note")).toBeVisible();
    const state = await (await teacher.request.get("/api/state")).json();
    expect(state.students.map((user: { id: string }) => user.id)).toEqual(["public-demo-student"]);
    const submission = state.submissions.find((item: { taskId: string }) => item.taskId === "public-demo-css");
    const source = await (await teacher.request.get(`/api/submissions/${submission.id}/source?revision=${submission.revision}`)).json();
    expect(JSON.stringify(source)).toContain(`Demo ${info.project.name} upload`);
    await teacher.getByRole("button", { name: /^Check tasks/ }).click();
    await teacher.getByRole("group", { name: "Check tasks task", exact: true }).getByRole("button", { name: /^Task 2/ }).click();
    await teacher.getByRole("button", { name: "Review next ungraded", exact: true }).click();
    await expect(teacher.getByRole("dialog")).toContainText("Style your page");
    await expect(teacher.frameLocator('iframe[title="Student project preview"]').getByRole("heading", { name: `Demo ${info.project.name} upload` })).toBeVisible();
    expect(await teacher.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await teacher.screenshot({ path: `artifacts/public-demo-teacher-${info.project.name}.png`, fullPage: true });
    await teacher.getByRole("button", { name: "Close review", exact: true }).first().click();
    await teacher.getByRole("button", { name: "Sign out", exact: true }).click();
    await login(teacher, { email: "fixture@example.test", password: "FixtureTeacher2026!" });
    const classroom = await (await teacher.request.get("/api/state")).json();
    expect(classroom.publicDemo).toBeUndefined();
    expect(classroom.students).toHaveLength(41);
    expect(JSON.stringify(classroom)).not.toContain("public-demo");
    await expect(teacher.getByRole("note")).toHaveCount(0);
  } finally { await context.close(); }
});
