/**
 * Auth helpers for E2E tests.
 *
 * The web dev server (vite-plugin-api) stubs auth endpoints so existing tests
 * don't need to log in. When a test needs to exercise the login screen, it
 * uses `mockAuthUnauthenticated()` to force /api/auth/me to return 401 so the
 * app routes the user to <LoginScreen />.
 */
import type { Page, Route } from "@playwright/test";

interface AuthMockOptions {
  /** If set, /api/login with this password returns 200; otherwise returns 401. */
  acceptPassword?: string;
  /** When true, after a successful login, subsequent /api/auth/me calls return 200. */
  rememberAfterLogin?: boolean;
  /** When true, the next /api/login returns 429 (rate limited). */
  rateLimited?: boolean;
}

/**
 * Install route handlers that force the login screen to appear and optionally
 * validate a password. Must be called before `page.goto("/")`.
 */
export async function mockAuthUnauthenticated(
  page: Page,
  options: AuthMockOptions = {},
): Promise<void> {
  let authenticated = false;

  await page.route("**/api/auth/me", async (route: Route) => {
    if (authenticated) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: "test" }),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not authenticated" }),
      });
    }
  });

  await page.route("**/api/login", async (route: Route) => {
    if (options.rateLimited) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "retry-after": "900" },
        body: JSON.stringify({ error: "Too many attempts" }),
      });
      return;
    }
    const body = route.request().postDataJSON() as { password?: string };
    const expected = options.acceptPassword ?? "correct-password";
    if (body.password === expected) {
      if (options.rememberAfterLogin ?? true) authenticated = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: "test" }),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid password" }),
      });
    }
  });
}
