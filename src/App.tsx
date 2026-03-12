import { createSignal, onMount, Show } from "solid-js";
import { SetupScreen } from "./components/SetupScreen";
import { SettingsService } from "./services";

/**
 * Application state
 */
type AppState = "loading" | "setup" | "ready";

function App() {
  const [appState, setAppState] = createSignal<AppState>("loading");
  const [rootPath, setRootPath] = createSignal<string | null>(null);

  onMount(async () => {
    // Check if the app has been configured
    const configured = await SettingsService.isConfigured();

    if (configured) {
      const path = await SettingsService.getRootPath();
      setRootPath(path);
      setAppState("ready");
    } else {
      setAppState("setup");
    }
  });

  /**
   * Handle setup completion
   */
  function handleSetupComplete(path: string) {
    setRootPath(path);
    setAppState("ready");
  }

  return (
    <>
      <Show when={appState() === "loading"}>
        <div class="flex min-h-screen items-center justify-center bg-gray-50">
          <div class="text-gray-500">Loading...</div>
        </div>
      </Show>

      <Show when={appState() === "setup"}>
        <SetupScreen onComplete={handleSetupComplete} />
      </Show>

      <Show when={appState() === "ready"}>
        <main class="min-h-screen bg-gray-100 p-4">
          <div class="mx-auto max-w-4xl">
            <h1 class="mb-4 text-2xl font-bold text-gray-900">NslNotes</h1>
            <div class="rounded-lg bg-white p-6 shadow">
              <p class="mb-2 text-gray-600">Notes directory:</p>
              <p class="font-mono text-sm text-gray-800">{rootPath()}</p>
              <p class="mt-4 text-sm text-gray-500">
                Phase 1 complete! The app is configured and ready for Phase 2.
              </p>
            </div>
          </div>
        </main>
      </Show>
    </>
  );
}

export default App;
