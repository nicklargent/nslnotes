import { ErrorBoundary as SolidErrorBoundary, createSignal } from "solid-js";
import type { JSX } from "solid-js";

interface AppErrorBoundaryProps {
  children: JSX.Element;
}

/**
 * Application-level error boundary (T7.4).
 * Catches component errors and shows user-friendly fallback.
 */
export function AppErrorBoundary(props: AppErrorBoundaryProps) {
  return (
    <SolidErrorBoundary
      fallback={(err, reset) => <ErrorFallback error={err} onReset={reset} />}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}

function ErrorFallback(props: { error: Error; onReset: () => void }) {
  const [showDetails, setShowDetails] = createSignal(false);

  return (
    <div class="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
      <div class="w-full max-w-md rounded-lg border border-red-200 bg-white dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
        <div class="mb-4 flex items-center gap-2 text-red-600 dark:text-red-400">
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clip-rule="evenodd"
            />
          </svg>
          <h2 class="text-lg font-semibold">Something went wrong</h2>
        </div>

        <p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
          An unexpected error occurred. You can try recovering or reload the
          application.
        </p>

        <div class="flex gap-2">
          <button
            class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            onClick={() => props.onReset()}
          >
            Try Again
          </button>
          <button
            class="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>

        <button
          class="mt-3 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          onClick={() => setShowDetails(!showDetails())}
        >
          {showDetails() ? "Hide" : "Show"} error details
        </button>

        {showDetails() && (
          <pre class="mt-2 max-h-40 overflow-auto rounded bg-gray-100 dark:bg-gray-700 p-2 text-xs text-gray-700 dark:text-gray-200">
            {props.error?.message ?? "Unknown error"}
            {props.error?.stack ? `\n\n${props.error.stack}` : ""}
          </pre>
        )}
      </div>
    </div>
  );
}
