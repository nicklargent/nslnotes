interface StarIconProps {
  class?: string;
  /** When true, the star is filled (active/pinned state); otherwise outline only. */
  filled?: boolean;
}

export function StarIcon(props: StarIconProps) {
  return (
    <svg
      class={props.class ?? "h-4 w-4"}
      fill={props.filled ? "currentColor" : "none"}
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M12 2l2.09 6.26L21 9.27l-5 3.64L17.18 20 12 16.77 6.82 20 8 12.91l-5-3.64 6.91-1.01z"
      />
    </svg>
  );
}
