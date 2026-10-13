export default function BrandLogo() {
  return (
    <span className="brand-logo" role="img" aria-label="LabTrack">
      <svg className="brand-logo-icon" viewBox="0 0 100 76" fill="none" aria-hidden="true">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M12 0h76a12 12 0 0 1 12 12v52a12 12 0 0 1-12 12H12A12 12 0 0 1 0 64V12A12 12 0 0 1 12 0Zm-6.5 20v44a6.5 6.5 0 0 0 6.5 6.5h76a6.5 6.5 0 0 0 6.5-6.5V20h-89Z"
        />
        <circle cx="13" cy="10" r="3" fill="var(--brand-accent)" />
        <circle cx="24" cy="10" r="3" fill="var(--brand-window)" />
        <circle cx="35" cy="10" r="3" fill="var(--brand-window)" />
        <path d="m19 36 13 8-13 8m17 5h11" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path
          fill="var(--brand-accent)"
          fillRule="evenodd"
          d="M64 30h14a2.2 2.2 0 0 1 0 4.4h-1v9.3l10 16.8a4.5 4.5 0 0 1-3.9 6.8H59.1a4.5 4.5 0 0 1-3.9-6.8l10-16.8v-9.3H64a2.2 2.2 0 0 1 0-4.4Zm5.4 4.4v10.5l-5.6 9.5 13-3-4.5-7.5v-9.5h-2.9Z"
        />
      </svg>
      <span className="brand-logo-wordmark" aria-hidden="true">Lab<span>Track</span></span>
    </span>
  );
}
