import { ReactNode, useId } from "react";

export function OnboardingSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;

  return (
    <section className="card-obsidian space-y-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-base font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
      <div className="grid gap-4 pt-1">{children}</div>
    </section>
  );
}
