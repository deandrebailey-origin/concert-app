/** Certifi mark: five equalizer bars whose tops trace a checkmark. Colored with currentColor. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className} fill="currentColor">
      <rect x="6" y="50" width="12" height="40" rx="6" />
      <rect x="24" y="64" width="12" height="26" rx="6" />
      <rect x="42" y="42" width="12" height="48" rx="6" />
      <rect x="60" y="24" width="12" height="66" rx="6" />
      <rect x="78" y="8" width="12" height="82" rx="6" />
    </svg>
  );
}
