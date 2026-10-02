import { VirtualDateRound } from "@/lib/types/matching";

const signalStyles = {
  positive: "border-[rgba(216,191,65,0.36)] bg-[rgba(216,191,65,0.14)] text-[var(--color-text-primary)]",
  mixed: "border-[rgba(216,130,170,0.34)] bg-[rgba(216,130,170,0.14)] text-[var(--color-text-primary)]",
  caution: "border-[rgba(142,87,165,0.42)] bg-[rgba(142,87,165,0.18)] text-[var(--color-text-primary)]",
} as const;

export function VirtualDateRoundCard({ round }: { round: VirtualDateRound }) {
  return (
    <article className="obsidian-card rounded-[26px] p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-black text-white">{round.title}</h3>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${signalStyles[round.signal]}`}>
          {round.signal}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/68">{round.summary}</p>
    </article>
  );
}
