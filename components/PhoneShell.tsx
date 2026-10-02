import { ReactNode } from "react";

type PhoneShellProps = {
  children: ReactNode;
  /** Visually hidden title for landmark when page already has visible h1 elsewhere */
  label?: string;
};

export function PhoneShell({ children, label = "Main content" }: PhoneShellProps) {
  return (
    <div className="phone-shell">
      <div className="phone-frame">
        <div
          className="flex min-h-dvh flex-1 flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="main"
          aria-label={label}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
