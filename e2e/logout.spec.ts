import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page, role: "teacher" | "student" | "setup" = "teacher", setupRoll = "40") {
  await page.goto("/");
  await page.getByLabel("Email or student roll number").fill(role === "teacher" ? "fixture@example.test" : role === "setup" ? setupRoll : "1");
  await page.getByLabel("Password", { exact: true }).fill(role === "setup" ? "48276193" : "FixtureTeacher2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true }).first()).toBeVisible();
}

for (const role of ["teacher", "student", "setup"] as const) {
  test(`${role} sign-out shows immediate progress until its single request completes`, async ({ page }, info) => {
    await signIn(page, role, info.project.name === "desktop" ? "40" : "41");
    let requests = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/auth/logout", async route => {
      requests++;
      await gate;
      await route.continue();
    });
    try {
      await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
      await expect(page.getByRole("status")).toContainText("Signing out…");
      await expect(page.getByRole("main", { name: "Signing out", exact: true })).toHaveAttribute("aria-busy", "true");
      await expect(page.locator(".signout-spinner")).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
      await expect(page.getByRole("form", { name: "Sign in to LabTrack", exact: true })).toHaveCount(0);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      expect(requests).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (role === "teacher") {
        await page.screenshot({ path: `artifacts/signout-loading-${info.project.name}.png` });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(page.locator(".signout-spinner")).toHaveCSS("animation-name", "none");
      }
      release();
      await expect(page.getByRole("form", { name: "Sign in to LabTrack", exact: true })).toBeVisible();
      await expect(page.getByRole("main", { name: "Signing out", exact: true })).toHaveCount(0);
      expect(requests).toBe(1);
    } finally {
      release();
    }
  });
}

for (const role of ["teacher", "student"] as const) {
  test(`${role} sign-out clears classroom data even if the next state refresh fails`, async ({ page }) => {
    await signIn(page, role);
    let signedOut = false;
    await page.route("**/api/auth/logout", async route => {
      const response = await route.fetch();
      signedOut = response.ok();
      await route.fulfill({ response });
    });
    await page.route("**/api/state", async route => {
      if (signedOut) await route.fulfill({ status: 503, json: { error: "Fixture refresh failure after sign-out" } });
      else await route.continue();
    });

    const signOut = page.getByRole("button", { name: "Sign out", exact: true }).first();
    await signOut.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("form", { name: "Sign in to LabTrack", exact: true })).toBeVisible();
    await expect(page.locator(".teacher-shell")).toHaveCount(0);
    expect(signedOut).toBe(true);
    expect((await (await page.request.get("/api/state")).json()).user).toBeNull();
  });
}

test("a classroom refresh started before sign-out cannot restore the workspace afterward", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: /^Check tasks(?: \d+)?$/ }).click();
  const refresh = page.getByRole("button", { name: "Refresh task submissions", exact: true });
  await expect(refresh).toBeEnabled();
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let captured: () => void = () => {};
  const snapshotCaptured = new Promise<void>(resolve => { captured = resolve; });
  let held = false;
  await page.route("**/api/state", async route => {
    if (held) {
      await route.fulfill({ status: 503, json: { error: "Fixture refresh failure after sign-out" } });
      return;
    }
    held = true;
    const response = await route.fetch();
    expect((await response.json()).user.role).toBe("teacher");
    captured();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await refresh.click();
    await snapshotCaptured;
    await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
    const login = page.getByRole("form", { name: "Sign in to LabTrack", exact: true });
    await expect(login).toBeVisible();
    const staleResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/state" && response.status() === 200);
    release();
    await (await staleResponse).finished();
    // Allow the completed fetch and React render to settle before checking the stale result.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole("button", { name: /^Check tasks(?: \d+)?$/ })).toHaveCount(0);
    await expect(login).toBeVisible();
    await expect(page.locator(".teacher-shell")).toHaveCount(0);
  } finally {
    release();
  }
});

test("a rejected sign-out keeps the active workspace and allows a retry", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/auth/logout", route => route.fulfill({ status: 503, json: { error: "Fixture sign-out failure" } }));
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await expect(page.getByRole("alert")).toContainText("Fixture sign-out failure");
  await expect(page.getByRole("button", { name: /^Check tasks(?: \d+)?$/ })).toBeVisible();
  expect((await (await page.request.get("/api/state")).json()).user.role).toBe("teacher");
  await page.unroute("**/api/auth/logout");
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await expect(page.getByRole("form", { name: "Sign in to LabTrack", exact: true })).toBeVisible();
});
