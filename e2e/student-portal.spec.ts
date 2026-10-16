import { test, expect, type Page } from "@playwright/test";

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
        grade: { marks: 0, feedback: "Add the required semantic page structure and resubmit your work.", published: true, gradedAt: "2026-10-15T10:00:00Z" },
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
  await expect(history.getByText("Add the required semantic page structure and resubmit your work.", { exact: false })).toBeVisible();
  await page.screenshot({ path: `artifacts/student-results-${info.project.name}.png`, fullPage: true });
  await page.getByLabel("Filter submissions by lab").selectOption("layout-lab");
  await expect(page.getByRole("heading", { name: "No submissions for this lab", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
