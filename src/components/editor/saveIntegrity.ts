import type { RoundTripCheck } from "./pmMarkdown";
import { showToast } from "../Toast";

/**
 * Surface the result of an editor round-trip integrity check (approach A).
 *
 * Hosts call this from their ProseEditor `onIntegrity` handler. ProseEditor only
 * emits on ok↔warning transitions, so each call here represents a real state
 * change. On a fresh warning we fire a (long-lived) toast; the returned boolean
 * drives the host's persistent inline indicator next to the save status.
 *
 * Centralizing the wording keeps DocView / TaskDetail / NamedNoteCard consistent.
 */
export function reportIntegrity(
  result: RoundTripCheck,
  opts: { title?: string } = {}
): boolean {
  if (!result.ok) {
    const where = opts.title ? ` in "${opts.title}"` : "";
    showToast(
      `⚠ Some content${where} may not save correctly — review this note before relying on it.`,
      "warning"
    );
    return true;
  }
  return false;
}
