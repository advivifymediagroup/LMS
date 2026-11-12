// Advivify mark ("Day Off": a calendar tile with a rising sun), in the portal's theme colours.
// `dark` = drawn on a dark background (sidebar, login panel): tabs and wordmark turn light.
export function LogoMark({ size = 32, dark = false }: { size?: number; dark?: boolean }) {
  const tab = dark ? "var(--color-paper)" : "var(--color-char)";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="flex-none">
      <rect x="4" y="10" width="56" height="50" rx="15" fill="var(--color-brand-500)" />
      <rect x="17" y="4" width="7" height="14" rx="3.5" fill={tab} />
      <rect x="40" y="4" width="7" height="14" rx="3.5" fill={tab} />
      <path d="M17 49a15 15 0 0 1 30 0z" fill="var(--color-brand-200)" />
      <rect x="13" y="49" width="38" height="4" rx="2" fill="var(--color-paper)" />
    </svg>
  );
}

export function Logo({ size = 32, dark = false, className = "" }: { size?: number; dark?: boolean; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`} aria-label="Advivify">
      <LogoMark size={size} dark={dark} />
      <span className={`font-extrabold leading-none tracking-[-0.035em] ${dark ? "text-paper" : "text-char"}`} style={{ fontSize: size * 0.68 }}>
        advivify<span className="text-brand-500">.</span>
      </span>
    </span>
  );
}
