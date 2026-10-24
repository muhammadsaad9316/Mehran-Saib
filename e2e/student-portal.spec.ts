import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

async function signInStudent(page: Page, roll: string) {
  await page.goto("/");
  await page.getByLabel("Email or student roll number").fill(roll);
  await page.getByLabel("Password", { exact: true }).fill("FixtureTeacher2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Web Engineering", exact: true })).toBeVisible();
}

test("student navigation, lab filters, keyboard tasks and own submission flow remain usable", async ({ page }, info) => {
  await signInStudent(page, info.project.name === "desktop" ? "3" : "4");
  const navigation = page.getByRole("navigation", { name: "Student navigation" });
  await expect(navigation.getByRole("button", { name: "My labs", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Submitted", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No labs in this filter" })).toBeVisible();
  await page.getByRole("button", { name: "Show all labs", exact: true }).click();
  const openLab = page.getByRole("button", { name: "Open Lab 1: Reliability fixture", exact: true });
  await openLab.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Task checklist", exact: true })).toBeVisible();
  const task = page.locator("details.student-task").filter({ hasText: "Task 2" });
  await task.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(task).toHaveAttribute("open", "");
  await task.getByRole("button", { name: "Submit task", exact: true }).click();
  const upload = page.getByRole("dialog", { name: "Submit lab work" });
  await expect(upload.getByLabel("Choose a task")).toHaveValue("fixture-task-2");
  await expect(upload.getByText("Choose files", { exact: true })).toBeVisible();
  await expect(upload.getByText("Choose folder", { exact: true })).toBeVisible();
  await expect(upload.getByText("Select one or more project files.", { exact: true })).toBeVisible();
  await expect(upload.getByText("Include a project folder and its subfolders.", { exact: true })).toBeVisible();
  await expect(upload.locator('input[type="url"]')).toHaveCount(0);
  await expect(upload.getByLabel("Choose project files", { exact: true })).not.toHaveAttribute("accept", /zip/i);
  await upload.getByLabel("Choose project files", { exact: true }).setInputFiles({
    name: "project.zip", mimeType: "application/zip", buffer: Buffer.from("Compressed fixture"),
  });
  await expect(upload.getByRole("alert")).toHaveText("Extract compressed folders first, then choose your project files or folder.");
  await expect(upload.getByRole("button", { name: "Submit task", exact: true })).toBeDisabled();
  await page.screenshot({ path: `artifacts/student-upload-${info.project.name}.png`, fullPage: true });
  await upload.getByLabel("Choose project files", { exact: true }).setInputFiles({
    name: "index.html", mimeType: "text/html", buffer: Buffer.from("<h1>Student workspace check</h1>"),
  });
  await upload.getByRole("button", { name: "Submit task", exact: true }).click();
  await expect(upload).toBeHidden();
  await expect(task.getByText("Submitted", { exact: true })).toBeVisible();
  await navigation.getByRole("button", { name: "My submissions", exact: true }).click();
  const history = page.getByRole("region", { name: "Your submissions and grades" });
  await expect(history.getByRole("heading", { name: "Task 2", exact: true })).toBeVisible();
  await expect(history.getByText("Awaiting grade", { exact: true })).toBeVisible();
  await history.getByRole("button", { name: "View Task 2 submission", exact: true }).click();
  const review = page.getByRole("dialog");
  await expect(review.getByRole("heading", { name: "Task 2", exact: true })).toBeVisible();
  await expect(page.frameLocator('iframe[title="Student project preview"]').getByRole("heading", { name: "Student workspace check" })).toBeVisible();
  await expect(review.getByRole("button", { name: /^Save grade/ })).toHaveCount(0);
  await review.getByRole("button", { name: "Close review", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("student results, empty states and long coursework remain readable across screen sizes", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/state", async route => {
    const response = await route.fetch();
    const state = await response.json();
    if (state.user?.role === "student") {
      const lab = state.labs[0];
      state.user.name = "Ayesha Khan";
      lab.title = "HTML foundations";
      lab.description = "Build a well-structured page with semantic HTML, clear navigation and accessible forms.";
      lab.tasks[0].title = "Structure a semantic web page";
      lab.tasks[1].title = "Create a contact form";
      state.labs.push({ ...lab, id: "layout-lab", title: "Responsive layouts with CSS Grid and Flexbox", dueDate: "2026-11-02T18:59:00Z" });
      state.submissions = [{
        id: "layout-submission", studentId: state.user.id, labId: lab.id, taskId: lab.tasks[0].id,
        revision: 1, files: [], link: null, submittedAt: "2026-10-14T10:00:00Z", status: "graded", late: false,
        resubmissionLocked: true,
        grade: { marks: 0, feedback: "Use the required semantic page structure in your next task.", published: true, gradedAt: "2026-10-15T10:00:00Z" },
      }];
    }
    await route.fulfill({ response, json: state });
  });
  await signInStudent(page, info.project.name === "desktop" ? "5" : "6");
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `artifacts/student-portal-${info.project.name}.png`, fullPage: true });
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator(".student-lab-info").first().evaluate(element => element.clientWidth)).toBeGreaterThanOrEqual(160);
    await expect(page.getByRole("button", { name: "Open Lab 2: Responsive layouts with CSS Grid and Flexbox", exact: true })).toBeVisible();
    if (info.project.name === "desktop" && [768, 1024].includes(width))
      await page.screenshot({ path: `artifacts/student-portal-${width}.png`, fullPage: true });
  }
  await page.setViewportSize(info.project.use.viewport!);
  await page.getByRole("navigation", { name: "Student navigation" }).getByRole("button", { name: "My submissions", exact: true }).click();
  const history = page.getByRole("region", { name: "Your submissions and grades" });
  await expect(history.getByText("Graded", { exact: true })).toBeVisible();
  await expect(history.getByText("0/10", { exact: true })).toBeVisible();
  await expect(history.getByText("Use the required semantic page structure in your next task.", { exact: false })).toBeVisible();
  await page.screenshot({ path: `artifacts/student-results-${info.project.name}.png`, fullPage: true });
  await page.getByLabel("Filter submissions by lab").selectOption("layout-lab");
  await expect(page.getByRole("heading", { name: "No submissions for this lab", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("student deadlines count down in labs, task details and uploads, including no deadline and elapsed deadlines", async ({ page }, info) => {
  const now = new Date("2026-10-23T12:00:00Z");
  await page.clock.install({ time: now });
  let dueDate = new Date(now.getTime() + 44 * 3600000 + 60000).toISOString();
  await page.route("**/api/state", async route => {
    const response = await route.fetch();
    const state = await response.json();
    if (state.user?.role === "student") state.labs[0].dueDate = dueDate;
    await route.fulfill({ response, json: state });
  });
  await signInStudent(page, info.project.name === "desktop" ? "11" : "12");
  await expect(page.getByText("1 day 20 hours remaining", { exact: true })).toBeVisible();
  await page.clock.fastForward(3600000);
  await expect(page.getByText("1 day 19 hours remaining", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open Lab 1: Reliability fixture", exact: true }).click();
  await expect(page.getByText("1 day 19 hours remaining", { exact: true })).toBeVisible();
  await page.locator("details.student-task").first().getByRole("button", { name: "Submit task", exact: true }).click();
  const upload = page.getByRole("dialog", { name: "Submit lab work" });
  await expect(upload.getByText(/1 day 19 hours remaining/)).toBeVisible();
  await upload.getByRole("button", { name: "Cancel", exact: true }).click();
  dueDate = "";
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("No deadline", { exact: true })).toBeVisible();
  dueDate = now.toISOString();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Deadline passed", { exact: true })).toBeVisible();
  await expect(page.locator("details.student-task").first().getByRole("button", { name: "Submit task", exact: true })).toBeEnabled();
});

test("grading locks one task, rejects an already open upload, and newly published feedback is noticed and acknowledged", async ({ page, playwright }, info) => {
  await page.clock.install();
  const teacher = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3127" });
  try {
    expect((await teacher.post("/api/auth/login", { data: { email: "fixture@example.test", password: "FixtureTeacher2026!" } })).ok()).toBe(true);
    await signInStudent(page, info.project.name === "desktop" ? "7" : "8");
    await page.locator(".student-task-track button").first().click();
    const upload = page.getByRole("dialog", { name: "Submit lab work" });
    const file = { name: "index.html", mimeType: "text/html", buffer: Buffer.from("<h1>Retain my graded work</h1>") };
    await upload.getByLabel("Choose project files", { exact: true }).setInputFiles(file);
    const saved = page.waitForResponse(response => response.url().endsWith("/api/submissions") && response.request().method() === "POST");
    await upload.getByRole("button", { name: "Submit task", exact: true }).click();
    const submission = await (await saved).json();
    await expect(upload).toBeHidden();
    await page.locator(".student-task-track button").first().click();
    await upload.getByLabel("Choose project files", { exact: true }).setInputFiles(file);
    const gradeRoute = `/api/submissions/${submission.id}/grade`;
    expect((await teacher.patch(gradeRoute, { data: { marks: 0, feedback: "Private draft feedback", published: false, revision: 1 } })).ok()).toBe(true);
    await upload.getByRole("button", { name: "Resubmit task", exact: true }).click();
    await expect(upload.getByRole("alert")).toContainText("already been graded");
    await expect(upload.getByRole("button", { name: "Resubmit task", exact: true })).toBeDisabled();
    await expect(upload).not.toContainText("Private draft feedback");
    await upload.getByRole("button", { name: "Cancel", exact: true }).click();
    await upload.getByRole("button", { name: "Discard & close", exact: true }).click();
    await expect(page.getByText("New feedback", { exact: true })).toHaveCount(0);
    expect((await teacher.patch(gradeRoute, { data: { marks: 0, feedback: "Published feedback for your task", published: true, revision: 1 } })).ok()).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("status").filter({ hasText: "1 new result" })).toBeVisible();
    await page.getByRole("button", { name: "View results", exact: true }).click();
    await expect(page.getByText("New feedback", { exact: true })).toBeVisible();
    const history = page.getByRole("region", { name: "Your submissions and grades" });
    let failAcknowledgement = true;
    await page.route("**/api/submissions/*/result-viewed", async route => {
      if (failAcknowledgement) {
        failAcknowledgement = false;
        await route.fulfill({ status: 503, json: { error: "Isolated acknowledgement failure" } });
      } else await route.continue();
    });
    await history.getByRole("button", { name: "View Task 1 submission", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Your submission" });
    await expect(review.getByText("Published feedback for your task", { exact: true })).toBeVisible();
    await review.getByRole("button", { name: "Close review", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("read status could not be saved");
    await expect(page.getByText("New feedback", { exact: true })).toBeVisible();
    await history.getByRole("button", { name: "View Task 1 submission", exact: true }).click();
    await review.getByRole("button", { name: "Close review", exact: true }).click();
    await expect(page.getByText("New feedback", { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Web Engineering", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "1 new result" })).toHaveCount(0);
    await page.getByRole("navigation", { name: "Student navigation" }).getByRole("button", { name: "My labs", exact: true }).click();
    await page.locator(".student-task-track button").first().click();
    await expect(review).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Submit lab work" })).toHaveCount(0);
    await review.getByRole("button", { name: "Close review", exact: true }).click();
    await page.getByRole("button", { name: "Open Lab 1: Reliability fixture", exact: true }).click();
    const lockedTask = page.locator("details.student-task").first();
    await lockedTask.locator("summary").click();
    await expect(lockedTask.getByRole("button", { name: "Resubmit task", exact: true })).toHaveCount(0);
    await expect(lockedTask.getByText("Graded submissions are locked.", { exact: true })).toBeVisible();
    const otherTask = page.locator("details.student-task").nth(1);
    await otherTask.getByRole("button", { name: "Submit task", exact: true }).click();
    await expect(upload).toBeVisible();
    await expect(upload.getByRole("option", { name: "Task 1 · 10 marks", exact: true })).toHaveAttribute("disabled", "");
    await upload.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await teacher.patch(gradeRoute, { data: { marks: 1, feedback: "Updated published feedback", published: true, revision: 1 } })).ok()).toBe(true);
    await page.clock.fastForward(60000);
    await expect(page.getByRole("status").filter({ hasText: "1 new result" })).toBeVisible();
    const retained = await teacher.get(`/api/submissions/${submission.id}/source?revision=1`);
    expect((await retained.json()).revision).toBe(1);
  } finally { await teacher.dispose(); }
});

test("choosing a project folder preserves files in its subfolders", async ({ page }, info) => {
  const folder = info.outputPath("project-folder");
  await mkdir(`${folder}/assets`, { recursive: true });
  await writeFile(`${folder}/index.html`, '<h1>Folder upload</h1><link rel="stylesheet" href="assets/style.css">');
  await writeFile(`${folder}/assets/style.css`, "h1 { color: navy; }");
  await signInStudent(page, info.project.name === "desktop" ? "9" : "10");
  await page.locator(".student-task-track button").first().click();
  const upload = page.getByRole("dialog", { name: "Submit lab work" });
  await upload.getByLabel("Choose project folder", { exact: true }).setInputFiles(folder);
  await expect(upload.getByText("project-folder/assets/style.css", { exact: true })).toBeVisible();
  const saved = page.waitForResponse(response => response.url().endsWith("/api/submissions") && response.request().method() === "POST");
  await upload.getByRole("button", { name: "Submit task", exact: true }).click();
  const submission = await (await saved).json();
  expect(submission.files.map((file: { path: string }) => file.path).sort()).toEqual(["project-folder/assets/style.css", "project-folder/index.html"]);
  await expect(upload).toBeHidden();
});

test("upload selections accumulate, show every file, and require confirmation before losing work", async ({ page }, info) => {
  await signInStudent(page, info.project.name === "desktop" ? "13" : "14");
  await page.locator(".student-task-track button").first().click();
  const upload = page.getByRole("dialog", { name: "Submit lab work" });
  const input = upload.getByLabel("Choose project files", { exact: true });
  const selection = upload.getByRole("region", { name: "Selected project files" });
  await input.setInputFiles({ name: "index.html", mimeType: "text/html", buffer: Buffer.alloc(1024, "a") });
  await input.setInputFiles({ name: "style.css", mimeType: "text/css", buffer: Buffer.alloc(2048, "b") });
  await expect(selection).toContainText("2 of 60 files · 3.0 KB / 4 MB");
  await expect(selection.getByText("index.html", { exact: true })).toBeVisible();
  await input.setInputFiles({ name: "index.html", mimeType: "text/html", buffer: Buffer.alloc(3072, "c") });
  await expect(selection).toContainText("2 of 60 files · 5.0 KB / 4 MB");
  await expect(upload.getByRole("status")).toHaveText("1 existing file was replaced by the newly selected version.");
  await input.setInputFiles(Array.from({ length: 11 }, (_, i) => ({ name: `notes-${i}.txt`, mimeType: "text/plain", buffer: Buffer.alloc(128, "x") })));
  await expect(selection).toContainText("13 of 60 files · 6.4 KB / 4 MB");
  await expect(selection.locator(".selected-files > div")).toHaveCount(10);
  await selection.getByRole("button", { name: "Show all 13 files", exact: true }).click();
  await expect(selection.locator(".selected-files > div")).toHaveCount(13);
  await selection.getByRole("button", { name: "Remove notes-10.txt", exact: true }).click();
  await expect(selection.locator(".selected-files > div")).toHaveCount(12);
  await input.setInputFiles({ name: "project.zip", mimeType: "application/zip", buffer: Buffer.from("fixture") });
  await expect(upload.getByRole("alert")).toContainText("Your current selection was kept.");
  await expect(selection.locator(".selected-files > div")).toHaveCount(12);
  await input.setInputFiles({ name: "large.css", mimeType: "text/css", buffer: Buffer.alloc(4 * 1024 * 1024, "x") });
  await expect(upload.getByRole("alert")).toContainText("combined size no larger than 4 MB");
  await expect(upload.getByRole("button", { name: "Submit task", exact: true })).toBeDisabled();
  await selection.getByRole("button", { name: "Remove large.css", exact: true }).click();
  await expect(upload.getByRole("alert")).toHaveCount(0);
  await expect(upload.getByRole("button", { name: "Submit task", exact: true })).toBeEnabled();
  await input.setInputFiles(Array.from({ length: 49 }, (_, i) => ({ name: `extra-${i}.txt`, mimeType: "text/plain", buffer: Buffer.from("x") })));
  await expect(selection).toContainText("61 of 60 files");
  await expect(upload.getByRole("button", { name: "Submit task", exact: true })).toBeDisabled();
  await selection.getByRole("button", { name: "Remove extra-48.txt", exact: true }).click();
  await expect(upload.getByRole("button", { name: "Submit task", exact: true })).toBeEnabled();
  await upload.getByRole("button", { name: "Replace selection", exact: true }).click();
  await expect(upload.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
  await upload.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(selection).toContainText("60 of 60 files");
  await upload.getByRole("button", { name: "Replace selection", exact: true }).click();
  await upload.getByRole("button", { name: "Discard & choose again", exact: true }).click();
  await expect(selection).toHaveCount(0);
  await input.setInputFiles({ name: "index.html", mimeType: "text/html", buffer: Buffer.from("<h1>Keep this selection</h1>") });
  const chooser = upload.getByLabel("Choose a task");
  await chooser.selectOption("fixture-task-2");
  await expect(chooser).toHaveValue("fixture-task-1");
  await upload.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(selection).toContainText("index.html");
  await chooser.selectOption("fixture-task-2");
  await upload.getByRole("button", { name: "Discard & switch task", exact: true }).click();
  await expect(chooser).toHaveValue("fixture-task-2");
  await expect(selection).toHaveCount(0);
  await input.setInputFiles({ name: "index.html", mimeType: "text/html", buffer: Buffer.from("<h1>Keep this selection</h1>") });
  for (const trigger of [
    () => page.keyboard.press("Escape"),
    () => upload.getByRole("button", { name: "Close submission form", exact: true }).click(),
    () => page.locator(".modal-overlay").click({ position: { x: 2, y: 2 } }),
  ]) {
    await trigger();
    await expect(upload.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(selection).toContainText("index.html");
  }
  const beforeUnloadPrompt = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const prompt = await beforeUnloadPrompt;
  expect(prompt.type()).toBe("beforeunload");
  await prompt.dismiss();
  expect(page.isClosed()).toBe(false);
  await expect(selection).toContainText("index.html");
  await upload.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.screenshot({ path: `artifacts/student-upload-discard-${info.project.name}.png` });
  await upload.getByRole("button", { name: "Discard & close", exact: true }).click();
  await expect(upload).toBeHidden();
});

test("an active upload blocks dismissal and navigation until its single request completes", async ({ page }, info) => {
  await signInStudent(page, info.project.name === "desktop" ? "15" : "16");
  await page.locator(".student-task-track button").first().click();
  const upload = page.getByRole("dialog", { name: "Submit lab work" });
  await upload.getByLabel("Choose project files", { exact: true }).setInputFiles({ name: "index.html", mimeType: "text/html", buffer: Buffer.from("<h1>Single pending upload</h1>") });
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route("**/api/submissions", async route => { requests++; await waiting; await route.continue(); });
  await upload.getByRole("button", { name: "Submit task", exact: true }).click();
  await expect(upload).toHaveAttribute("aria-busy", "true");
  await expect(upload.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await expect(upload.getByRole("button", { name: "Close submission form", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.locator(".modal-overlay").click({ position: { x: 2, y: 2 } });
  await expect(upload).toBeVisible();
  expect(await page.evaluate(() => !window.dispatchEvent(new Event("labtrack:before-navigate", { cancelable: true })))).toBe(true);
  expect(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })))).toBe(true);
  const saved = page.waitForResponse(response => response.url().endsWith("/api/submissions") && response.request().method() === "POST");
  release();
  expect((await saved).status()).toBe(201);
  await expect(upload).toBeHidden();
  expect(requests).toBe(1);
});
