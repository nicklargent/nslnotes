import { test, expect } from "@playwright/test";
import { mockAuthUnauthenticated } from "./helpers/auth";

test.describe("Login screen", () => {
  test("shows login screen when /api/auth/me returns 401", async ({ page }) => {
    await mockAuthUnauthenticated(page);
    await page.goto("/");

    await expect(page.getByTestId("login-password")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  test("accepts correct password and leaves the login screen", async ({
    page,
  }) => {
    await mockAuthUnauthenticated(page, { acceptPassword: "hunter2" });
    await page.goto("/");

    await page.getByTestId("login-password").fill("hunter2");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-password")).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("shows error on incorrect password", async ({ page }) => {
    await mockAuthUnauthenticated(page, { acceptPassword: "hunter2" });
    await page.goto("/");

    await page.getByTestId("login-password").fill("wrong");
    await page.getByTestId("login-submit").click();

    await expect(page.getByText(/incorrect password/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("login-password")).toBeVisible();
  });

  test("shows rate-limited error on 429", async ({ page }) => {
    await mockAuthUnauthenticated(page, { rateLimited: true });
    await page.goto("/");

    await page.getByTestId("login-password").fill("anything");
    await page.getByTestId("login-submit").click();

    await expect(page.getByText(/too many login attempts/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});
