import { test, expect } from "@playwright/test";

test("sign-in password can be checked with keyboard or touch without changing or submitting it", async ({ page }, info) => {
  let logins = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/auth/login", async route => {
    logins++;
    expect(route.request().postDataJSON().password).toBe("FixtureTeacher2026!");
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/");
    const email = page.getByLabel("Email or student roll number");
    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    await email.fill("fixture@example.test");
    await password.fill("FixtureTeacher2026!");
    await email.focus();
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Show password", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    const hide = page.getByRole("button", { name: "Hide password", exact: true });
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("FixtureTeacher2026!");
    await page.keyboard.press("Space");
    await expect(password).toHaveAttribute("type", "password");
    const show = page.getByRole("button", { name: "Show password", exact: true });
    if (info.project.name === "mobile") await show.tap(); else await show.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("FixtureTeacher2026!");
    expect(logins).toBe(0);
    const box = await page.getByRole("button", { name: "Hide password", exact: true }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/password-visibility-${info.project.name}.png` });
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Hide password", exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole("button", { name: "Sign out", exact: true }).first()).toBeVisible();
    expect(logins).toBe(1);
    await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue("");
  } finally { release(); }
});

test("teacher can check an initial password and reopening the form masks it again", async ({ page }) => {
  await page.route("**/api/state", async route => {
    const response = await route.fetch();
    const state = await response.json();
    if (state.user?.role === "teacher") state.students = state.students.filter((student: { rollNumber: string }) => student.rollNumber !== "41");
    await route.fulfill({ response, json: state });
  });
  let additions = 0;
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/students") additions++; });
  await page.goto("/");
  await page.getByLabel("Email or student roll number").fill("fixture@example.test");
  await page.getByLabel("Password", { exact: true }).fill("FixtureTeacher2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Students", exact: true }).click();
  await page.getByRole("button", { name: "Add student", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add student", exact: true });
  const password = dialog.getByLabel("Initial password", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await password.fill("InitialFixture2026!");
  await dialog.getByRole("button", { name: "Show initial password", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("InitialFixture2026!");
  expect(await dialog.evaluate(form => new FormData(form as HTMLFormElement).get("password"))).toBe("InitialFixture2026!");
  await dialog.getByRole("button", { name: "Hide initial password", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("InitialFixture2026!");
  expect(additions).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Close student form", exact: true }).click();
  await page.getByRole("button", { name: "Add student", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("");
});
