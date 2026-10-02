import { Recommendation } from "@/lib/types/matching";

const palette = {
  meet: "border-[#D9BF41]/45 bg-[#D9BF41]/15 text-[#F2C9DC]",
  maybe: "border-[#D982AB]/45 bg-[#D982AB]/15 text-[#F2C9DC]",
  "not-recommended": "border-[#8E58A6]/45 bg-[#8E58A6]/18 text-[#F2C9DC]",
} as const;

export function RecommendationBadge({ recommendation }: { recommendation: Recommendation }) {
  const label =
    recommendation.verdict === "meet"
      ? "Recommend Meeting"
      : recommendation.verdict === "maybe"
        ? "Maybe — Human Review"
        : "Not Recommended";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-black ${palette[recommendation.verdict]}`}>
      {label}
    </span>
  );
}
