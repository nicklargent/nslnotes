import { createStore } from "solid-js/store";
import {
  SettingsService,
  type AppSettings,
  type Notebook,
  type NotebookCredentials,
} from "../services/SettingsService";

interface NotebooksState {
  notebooks: Notebook[];
  activeNotebookId: string | null;
  /** True while a notebook switch is in flight. UI should disable the picker. */
  switching: boolean;
}

const [notebooksStore, setNotebooksStore] = createStore<NotebooksState>({
  notebooks: [],
  activeNotebookId: null,
  switching: false,
});

function publish(settings: AppSettings): void {
  setNotebooksStore({
    notebooks: settings.notebooks,
    activeNotebookId: settings.activeNotebookId,
  });
}

/** Publish an already-loaded settings blob to the store. */
function hydrateFrom(settings: AppSettings): void {
  publish(settings);
}

function activeNotebook(): Notebook | null {
  const id = notebooksStore.activeNotebookId;
  if (!id) return null;
  return notebooksStore.notebooks.find((n) => n.id === id) ?? null;
}

export const notebooksApi = {
  hydrateFrom,
  activeNotebook,
  setSwitching(v: boolean) {
    setNotebooksStore("switching", v);
  },
  async add(
    path: string,
    name?: string,
    creds?: NotebookCredentials
  ): Promise<Notebook> {
    const { notebook, settings } = await SettingsService.addNotebook(
      path,
      name,
      creds
    );
    publish(settings);
    return notebook;
  },
  async remove(id: string): Promise<void> {
    publish(await SettingsService.removeNotebook(id));
  },
  async rename(id: string, name: string): Promise<void> {
    publish(await SettingsService.renameNotebook(id, name));
  },
  /**
   * Persist the active notebook. Does NOT trigger index teardown/rebuild —
   * the caller owns that side effect.
   */
  async setActive(id: string): Promise<void> {
    publish(await SettingsService.setActiveNotebook(id));
  },
};

export { notebooksStore };
