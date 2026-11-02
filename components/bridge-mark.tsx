export function BridgeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id="nm" x1="0" x2="1">
          <stop offset="0" stopColor="#FF9933" />
          <stop offset="0.5" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#34D399" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" />
      <path d="M7 27 Q20 8 33 27" fill="none" stroke="url(#nm)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M6 27.5 H34" stroke="#e7eaf3" strokeWidth="2" strokeLinecap="round" />
      {[12, 16.5, 20, 23.5, 28].map((x, i) => (
        <path key={x} d={`M${x} 27 V${[21.5, 18.2, 17.4, 18.2, 21.5][i]}`} stroke="#8b93ab" strokeWidth="1.2" />
      ))}
    </svg>
  );
}
