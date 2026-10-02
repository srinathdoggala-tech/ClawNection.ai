type CompatibilityScoreProps = {
  score: number;
};

export function CompatibilityScore({ score }: CompatibilityScoreProps) {
  const hue = score >= 75 ? "bg-[#D9BF41]" : score >= 55 ? "bg-[#D982AB]" : "bg-[#8E58A6]";
  const summary =
    score >= 75
      ? "Strong match signal"
      : score >= 55
        ? "Mixed match signal"
        : "Low match signal";

  return (
    <section aria-labelledby="compatibility-score-title" className="obsidian-card rounded-[28px] p-5">
      <p id="compatibility-score-title" className="text-xs font-black uppercase tracking-[0.18em] text-white/44">Compatibility score</p>
      <div className="mt-2 flex items-end gap-3">
        <p className="text-5xl font-black tracking-tight text-white">{score}</p>
        <p className="pb-2 text-sm text-white/50">out of 100</p>
      </div>
      <p className="mt-2 text-sm font-bold text-white/74">{summary}</p>
      <div
        className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/10"
        role="img"
        aria-label={`Compatibility score is ${score} out of 100. ${summary}.`}
      >
        <div className={`h-full rounded-full ${hue}`} style={{ width: `${score}%` }} />
      </div>
    </section>
  );
}
