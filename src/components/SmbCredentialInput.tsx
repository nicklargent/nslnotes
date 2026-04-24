import type { NotebookCredentials } from "../services/SettingsService";

export interface SmbCredentialInputProps {
  username: string;
  password: string;
  domain: string;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onDomainChange: (v: string) => void;
}

/**
 * Three-field SMB credential form used by both the first-run SetupScreen and
 * the "Add Notebook" dialog. Rendered only when the path is an `smb://` URL.
 */
export function SmbCredentialInput(props: SmbCredentialInputProps) {
  return (
    <div class="mb-3 space-y-2">
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-200">
          SMB username
        </label>
        <input
          type="text"
          autocomplete="off"
          value={props.username}
          onInput={(e) => props.onUsernameChange(e.currentTarget.value)}
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-200">
          SMB password
        </label>
        <input
          type="password"
          autocomplete="new-password"
          value={props.password}
          onInput={(e) => props.onPasswordChange(e.currentTarget.value)}
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-200">
          Domain / workgroup (optional)
        </label>
        <input
          type="text"
          autocomplete="off"
          value={props.domain}
          placeholder="WORKGROUP"
          onInput={(e) => props.onDomainChange(e.currentTarget.value)}
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Credentials are encrypted with your login password before being stored.
      </p>
    </div>
  );
}

/** True when the path is an SMB URL and thus needs credentials. */
export function isSmbPath(path: string): boolean {
  return path.trim().startsWith("smb://");
}

/**
 * Build a [`NotebookCredentials`] payload from three reactive values. Returns
 * `undefined` when the path isn't SMB so callers can pass the result straight
 * into `notebooksApi.add(path, name, creds)`.
 */
export function buildSmbCredentials(
  path: string,
  username: string,
  password: string,
  domain: string
): NotebookCredentials | undefined {
  if (!isSmbPath(path)) return undefined;
  const c: NotebookCredentials = {};
  if (username) c.smbUsername = username;
  if (password) c.smbPassword = password;
  if (domain) c.smbDomain = domain;
  return c;
}
