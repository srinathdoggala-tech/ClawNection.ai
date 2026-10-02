import { AgentAdapter, ClosingAssessmentInput } from "@/lib/agents/types";
import {
  RomanticProfile,
  VirtualDateRound,
  VirtualDateRoundType,
} from "@/lib/types/matching";
import { WhatsAppSignals } from "@/lib/types/behavioral";

const roundLanguage: Record<VirtualDateRoundType, string> = {
  introductions: "established tone and baseline attraction factors",
  intentions: "checked intent alignment and timeline compatibility",
  lifestyle: "compared day-to-day rhythms and practical fit",
  values: "validated core principles and long-term priorities",
  communication: "tested conflict style and emotional expression",
  "fun-chemistry": "estimated playful energy and spontaneous rapport",
};

export class HostedAgentAdapter implements AgentAdapter {
  readonly type = "hosted" as const;
  private signals: WhatsAppSignals | null;

  constructor(signals?: WhatsAppSignals | null) {
    this.signals = signals ?? null;
  }

  getAgentSummary(profile: RomanticProfile): string {
    return `Hosted Clawnection agent for ${profile.name}: calibrated for ${profile.relationshipIntent} matchmaking, prioritizing ${profile.values.slice(0, 2).join(" and ")}.`;
  }

  participateInVirtualDate(
    self: RomanticProfile,
    counterpart: RomanticProfile,
    roundType: VirtualDateRoundType,
  ): Pick<VirtualDateRound, "summary" | "signal"> {
    const sharedInterests = self.interests.filter((interest) =>
      counterpart.interests.includes(interest),
    );
    const signal: VirtualDateRound["signal"] =
      sharedInterests.length >= 2
        ? "positive"
        : sharedInterests.length === 1
          ? "mixed"
          : "caution";

    // For the communication round, enrich summary with behavioral signal data if available
    if (roundType === "communication" && this.signals && !this.signals.isLowConfidence) {
      const depthNote =
        this.signals.longMessageRatio > 0.4
          ? "tends toward substantive message depth"
          : "typically communicates in concise bursts";
      const initiationNote =
        this.signals.initiationRatio > 0.55
          ? "historically initiates contact more often than average"
          : this.signals.initiationRatio < 0.35
            ? "tends to respond rather than initiate conversations"
            : "shows balanced contact initiation patterns";
      return {
        summary: `Hosted agent ${roundLanguage[roundType]}: behavioral data shows ${self.name} ${depthNote} and ${initiationNote}.`,
        signal,
      };
    }

    return {
      summary: `Hosted agent ${roundLanguage[roundType]} and noted ${sharedInterests.length > 0 ? `shared interests in ${sharedInterests.slice(0, 2).join(" and ")}` : "few direct overlaps, requiring stronger intentional coordination"}.`,
      signal,
    };
  }

  generateClosingAssessment(
    self: RomanticProfile,
    counterpart: RomanticProfile,
    input: ClosingAssessmentInput,
  ): string {
    const attachmentNote = this.signals
      ? this.signals.responseLatencyStdDevMs > this.signals.avgResponseLatencyMs * 1.5
        ? " Behavioral note: response pacing inconsistency may be worth discussing openly early on."
        : " Behavioral note: consistent response rhythm is a positive attachment signal."
      : "";

    return `Hosted synthesis: ${self.name} and ${counterpart.name} scored ${input.score}/100 with strongest indicators around ${input.strengths.slice(0, 2).join("; ") || "baseline alignment"}. Key watchpoint: ${input.concerns[0]?.title ?? "none severe"}.${attachmentNote}`;
  }
}
