interface Props {
  className?: string;
}

export default function QuordixLogo({ className }: Props) {
  return (
    <svg
      viewBox="0 0 669 185"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className || "quordix-logo-svg"}
      role="img"
      aria-label="Quordix"
    >
      <path
        className="quordix-logo-text"
        d="M392.152 86.976H370.136V136H352.6V72H367.064L370.136 77.248L379.224 72H392.152V86.976ZM419.823 71.36H436.591L445.679 76.608V42.56H463.215V136.64H448.751L445.679 131.392L436.591 136.64H419.823L404.975 128.064V79.936L419.823 71.36ZM445.679 121.664V86.336H422.511V121.664H445.679ZM500.011 72V136H482.475V72H500.011ZM481.835 60.096V42.56H500.651V60.096H481.835ZM511.545 136L534.841 103.36L512.313 72H531.385L543.929 90.048L556.473 72H575.545L552.889 103.36L576.313 136H557.497L543.929 116.8L530.361 136H511.545Z"
      />
      <path
        className="quordix-logo-text"
        d="M28.8 63.12V123.28H62.72V63.12H28.8ZM46.592 138.64H25.728L10.88 130.064V56.336L25.728 47.76H65.792L80.64 56.336V130.064L65.792 138.64L80.256 163.6H60.672L46.592 138.64ZM101.1 130.064V74H118.636V123.664H140.524V74H158.06V138.64H143.596L140.524 133.392L131.436 138.64H115.948L101.1 130.064Z"
      />
      <path
        className="quordix-bracket-left"
        d="M237.18 47L188 92.7119L237.18 140"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="quordix-bracket-right"
        d="M271 140L320.18 94.2881L271 47"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="quordix-dash"
        d="M602 128H661"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
