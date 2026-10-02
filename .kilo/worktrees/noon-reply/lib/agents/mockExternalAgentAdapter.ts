import { AgentAdapter, ClosingAssessmentInput } from "@/lib/agents/types";
import {
  RomanticProfile,
  VirtualDateRound,
  VirtualDateRoundType,
} from "@/lib/types/matching";

const externalPerspective: Record<VirtualDateRoundType, string> = {
  introductions: "expressive identity cues",
  intentions: "intent flexibility and pacing",
  lifestyle: "novelty tolerance in routine",
  values: "value language and ethics framing",
  communication: "repair style under disagreement",
  "fun-chemistry": "energy resonance and delight",
};

export class MockExternalAgentAdapter implements AgentAdapter {
  readonly type = "external-mock" as const;

  getAgentSummary(profile: RomanticProfile): string {
    return `Mock external agent for ${profile.name}: simulating bring-your-own-agent behavior with emphasis on ${profile.communicationStyle} communication and autonomy.`;
  }

  participateInVirtualDate(
    self: RomanticProfile,
    counterpart: RomanticProfile,
    roundType: VirtualDateRoundType,
  ): Pick<VirtualDateRound, "summary" | "signal"> {
    const valuesOverlap = self.values.filter((value) => counterpart.values.includes(value));
    const signal: VirtualDateRound["signal"] =
      valuesOverlap.length >= 2 ? "positive" : valuesOverlap.length === 1 ? "mixed" : "caution";

    return {
      summary: `External agent highlighted ${externalPerspective[roundType]} and observed ${valuesOverlap.length > 0 ? `shared values in ${valuesOverlap.slice(0, 2).join(" and ")}` : "a need for explicit expectation-setting"}.`,
      signal,
    };
  }

  generateClosingAssessment(
    self: RomanticProfile,
    counterpart: RomanticProfile,
    input: ClosingAssessmentInput,
  ): string {
    return `Mock external closing memo: compatibility appears ${input.score >= 75 ? "strong" : input.score >= 55 ? "promising but conditional" : "fragile"}. Preferred next step is human review of ${input.concerns[0]?.title?.toLowerCase() ?? "minor concerns"} before meeting.`;
  }
}
