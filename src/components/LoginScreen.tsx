import { createSignal } from "solid-js";

export interface LoginScreenProps {
  onSuccess: () => void;
}

export function LoginScreen(props: LoginScreenProps) {
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [submitting, setSubmitting] = createSignal(false);

  async function submit(e?: Event) {
    e?.preventDefault();
    if (!password() || submitting()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password() }),
      });
      if (res.ok) {
        setPassword("");
        props.onSuccess();
        return;
      }
      if (res.status === 429) {
        setError("Too many login attempts. Try again in a few minutes.");
      } else if (res.status === 401) {
        setError("Incorrect password.");
      } else {
        setError(`Login failed (${res.status}). Please try again.`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network error during login."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div class="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <form
        onSubmit={submit}
        class="w-full max-w-sm rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/50"
      >
        <h1 class="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
          NslNotes
        </h1>
        <p class="mb-6 text-gray-600 dark:text-gray-300">
          Sign in to continue.
        </p>

        {error() && (
          <div class="mb-4 rounded border border-red-200 bg-red-50 dark:bg-red-900/30 p-3">
            <p class="text-sm text-red-700 dark:text-red-200">{error()}</p>
          </div>
        )}

        <label
          for="password"
          class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          autocomplete="current-password"
          value={password()}
          onInput={(e) => setPassword(e.currentTarget.value)}
          disabled={submitting()}
          data-testid="login-password"
          class="mb-4 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <button
          type="submit"
          disabled={submitting() || !password()}
          data-testid="login-submit"
          class="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting() ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
