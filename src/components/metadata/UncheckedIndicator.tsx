import { Show } from "solid-js";

interface UncheckedIndicatorProps {
  show: boolean;
}

export function UncheckedIndicator(props: UncheckedIndicatorProps) {
  return (
    <Show when={props.show}>
      <span
        class="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400"
        title="Has unchecked items"
        aria-label="Has unchecked items"
      />
    </Show>
  );
}
