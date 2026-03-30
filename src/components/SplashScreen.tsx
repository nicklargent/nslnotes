import logoUrl from "../assets/logo.svg";

export interface LoadProgress {
  /** 0–100 */
  percent: number;
  /** Short status text shown below the bar */
  status: string;
}

export function SplashScreen(props: { progress: LoadProgress }) {
  return (
    <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-indigo-700">
      <img src={logoUrl} alt="NslNotes" class="mb-6 h-20 w-20 drop-shadow-lg" />
      <h1 class="mb-8 text-2xl font-semibold tracking-tight text-white">
        NslNotes
      </h1>

      <div class="w-56">
        <div class="h-2 overflow-hidden rounded-full bg-white/20">
          <div
            class="h-full rounded-full bg-white transition-[width] duration-150 ease-out"
            style={{ width: `${props.progress.percent}%` }}
          />
        </div>
        <p class="mt-3 text-center text-sm text-white/60">
          {props.progress.status}
        </p>
      </div>
    </div>
  );
}
