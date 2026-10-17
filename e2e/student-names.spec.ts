import { test, expect } from "@playwright/test";

test("teacher saves a student's full name from the profile using the keyboard", async ({ page }, info) => {
  await page.goto("/");
  await page.getByLabel("Email or student roll number").fill("fixture@example.test");
  await page.getByLabel("Password", { exact: true }).fill("FixtureTeacher2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Students", exact: true }).click();
  await page.getByRole("button", { name: "Open roll number 16", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Student profile" });
  const input = dialog.getByLabel("Full name", { exact: true });
  const original = await input.inputValue();
  const updated = `Updated student ${info.project.name}`;
  try {
    await input.fill(updated);
    await page.route("**/api/students/fixture-student-16", async route => {
      await route.fulfill({ status: 409, json: { error: "This student's name changed. Refresh before saving." } });
      await page.unroute("**/api/students/fixture-student-16");
    });
    await dialog.getByRole("button", { name: "Save name", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Refresh before saving.");
    await input.focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Save name", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("heading", { name: `Roll no. 16 · ${updated}`, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/student-name-${info.project.name}.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Open roll number 16", exact: true })).toBeFocused();
    await page.reload();
    await page.getByRole("button", { name: "Students", exact: true }).click();
    await page.getByRole("button", { name: "Open roll number 16", exact: true }).click();
    await expect(input).toHaveValue(updated);
  } finally {
    await page.request.patch("/api/students/fixture-student-16", { data: { name: original, previousName: updated } });
  }
});
