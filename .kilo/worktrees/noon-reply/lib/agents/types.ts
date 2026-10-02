import {
  Concern,
  RomanticProfile,
  VirtualDateRound,
  VirtualDateRoundType,
} from "@/lib/types/matching";

export type ClosingAssessmentInput = {
  strengths: string[];
  concerns: Concern[];
  score: number;
};

export interface AgentAdapter {
  readonly type: RomanticProfile["agentType"];
  getAgentSummary(profile: RomanticProfile): string;
  participateInVirtualDate(
    self: RomanticProfile,
    counterpart: RomanticProfile,
    roundType: VirtualDateRoundType,
  ): Pick<VirtualDateRound, "summary" | "signal">;
  generateClosingAssessment(
    self: RomanticProfile,
    counterpart: RomanticProfile,
    input: ClosingAssessmentInput,
  ): string;
}
