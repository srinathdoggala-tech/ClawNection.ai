import { HostedAgentAdapter } from "@/lib/agents/hostedAgentAdapter";
import { MockExternalAgentAdapter } from "@/lib/agents/mockExternalAgentAdapter";
import { AgentAdapter } from "@/lib/agents/types";
import {
  Concern,
  MatchResult,
  Recommendation,
  RomanticProfile,
  VirtualDateRound,
  VirtualDateRoundType,
} from "@/lib/types/matching";
import { WhatsAppSignals } from "@/lib/types/behavioral";
import { loadSignals } from "@/lib/storage";

const ROUND_TITLES: Record<VirtualDateRoundType, string> = {
  introductions: "Round 1 · Introductions",
  intentions: "Round 2 · Intentions",
  lifestyle: "Round 3 · Lifestyle",
  values: "Round 4 · Values",
  communication: "Round 5 · Communication",
  "fun-chemistry": "Round 6 · Fun & Chemistry",
};

const ROUND_ORDER: VirtualDateRoundType[] = [
  "introductions",
  "intentions",
  "lifestyle",
  "values",
  "communication",
  "fun-chemistry",
];

export const MATCH_SCORING_CONFIG = {
  baseScore: 50,
  sharedInterest: { perItem: 5, cap: 15 },
  sharedValue: { perItem: 7, cap: 21 },
  intent: { matchBonus: 14, mismatchPenalty: 10 },
  communication: {
    statedMatchBonus: 7,
    statedMismatchPenalty: 5,
    behavioralMatchBonus: 9,
    behavioralMismatchPenalty: 6,
    fastPaceCompatibilityBonus: 3,
    reflectivePaceCompatibilityBonus: 3,
    inconsistentWarmPenalty: 4,
  },
  lifestyle: {
    socialEnergyMatchBonus: 4,
    socialEnergyMismatchPenalty: 5,
    activityMatchBonus: 3,
    activityMismatchPenalty: 4,
  },
  locationMatchBonus: 6,
  ageRange: { matchBonus: 8, mismatchPenalty: 12 },
  smokingConflictPenalty: 20,
  generalDealbreakerPenalty: 14,
} as const;

export const MATCH_RECOMMENDATION_CONFIG = {
  meetMinScore: 78,
  maybeMinScore: 58,
  meetMaxHighConcerns: 0,
  meetMaxMediumConcerns: 1,
  maybeMaxHighConcerns: 1,
} as const;

function getAdapter(type: RomanticProfile["agentType"], signals?: WhatsAppSignals | null): AgentAdapter {
  if (type === "hosted") return new HostedAgentAdapter(signals ?? null);
  return new MockExternalAgentAdapter();
}

function overlap(a: string[], b: string[]) {
  return a.filter((item) => b.includes(item));
}

function hasDealbreakerConflict(a: RomanticProfile, b: RomanticProfile) {
  const bText = `${b.bio} ${b.interests.join(" ")} ${b.values.join(" ")} ${b.lifestyleHabits.smoking}`.toLowerCase();
  return a.dealbreakers.some((dealbreaker) => bText.includes(dealbreaker.toLowerCase()));
}

function applyScoreAdjustment(
  currentScore: number,
  adjustment: number,
  strengths: string[],
  concerns: Concern[],
  outcome: { strength?: string; concern?: Concern },
) {
  if (adjustment > 0 && outcome.strength) {
    strengths.push(outcome.strength);
  }

  if (adjustment < 0 && outcome.concern) {
    concerns.push(outcome.concern);
  }

  return currentScore + adjustment;
}

function areOpposites(a: string, b: string, low: string, high: string) {
  return (a === low && b === high) || (a === high && b === low);
}

function scoreProfiles(a: RomanticProfile, b: RomanticProfile, signalsA: WhatsAppSignals | null = null) {
  let score: number = MATCH_SCORING_CONFIG.baseScore;
  const strengths: string[] = [];
  const concerns: Concern[] = [];

  const sharedInterests = overlap(a.interests, b.interests);
  const sharedValues = overlap(a.values, b.values);
  const intentMatch = a.relationshipIntent === b.relationshipIntent;
  const communicationMatch = a.communicationStyle === b.communicationStyle;
  const locationMatch = a.location.split(",").pop()?.trim() === b.location.split(",").pop()?.trim();
  const socialEnergyMatch = a.lifestyleHabits.socialEnergy === b.lifestyleHabits.socialEnergy;
  const activityLevelMatch = a.lifestyleHabits.activityLevel === b.lifestyleHabits.activityLevel;

  score += Math.min(
    sharedInterests.length * MATCH_SCORING_CONFIG.sharedInterest.perItem,
    MATCH_SCORING_CONFIG.sharedInterest.cap,
  );
  score += Math.min(
    sharedValues.length * MATCH_SCORING_CONFIG.sharedValue.perItem,
    MATCH_SCORING_CONFIG.sharedValue.cap,
  );

  if (intentMatch) {
    score = applyScoreAdjustment(score, MATCH_SCORING_CONFIG.intent.matchBonus, strengths, concerns, {
      strength: "Aligned relationship intent and pacing expectations.",
    });
  } else {
    score = applyScoreAdjustment(score, -MATCH_SCORING_CONFIG.intent.mismatchPenalty, strengths, concerns, {
      concern: {
        title: "Intent mismatch",
        detail: `${a.name} seeks ${a.relationshipIntent} while ${b.name} currently prefers ${b.relationshipIntent}.`,
        severity: "medium",
      },
    });
  }

  if (signalsA && !signalsA.isLowConfidence) {
    const derivedStyle = signalsA.derivedCommunicationStyle;

    if (derivedStyle === b.communicationStyle) {
      score = applyScoreAdjustment(
        score,
        MATCH_SCORING_CONFIG.communication.behavioralMatchBonus,
        strengths,
        concerns,
        { strength: `Behavioral communication style (${derivedStyle}) aligns with counterpart.` },
      );
    } else {
      score = applyScoreAdjustment(
        score,
        -MATCH_SCORING_CONFIG.communication.behavioralMismatchPenalty,
        strengths,
        concerns,
        {
          concern: {
            title: "Communication style gap",
            detail: `Behavioral analysis suggests ${a.name} communicates as ${derivedStyle}, while ${b.name} is more ${b.communicationStyle}.`,
            severity: "low",
          },
        },
      );
    }

    const latencyMin = signalsA.avgResponseLatencyMs / 60_000;
    const isInconsistent = signalsA.responseLatencyStdDevMs > signalsA.avgResponseLatencyMs * 1.5;

    if (latencyMin < 30 && (b.communicationStyle === "direct" || b.communicationStyle === "warm")) {
      score = applyScoreAdjustment(
        score,
        MATCH_SCORING_CONFIG.communication.fastPaceCompatibilityBonus,
        strengths,
        concerns,
        { strength: "Response pace and communication style look naturally compatible." },
      );
    }

    if (latencyMin > 240 && b.communicationStyle === "reflective") {
      score = applyScoreAdjustment(
        score,
        MATCH_SCORING_CONFIG.communication.reflectivePaceCompatibilityBonus,
        strengths,
        concerns,
        { strength: "A slower conversational pace appears compatible with a reflective counterpart." },
      );
    }

    if (isInconsistent && b.communicationStyle === "warm") {
      score = applyScoreAdjustment(
        score,
        -MATCH_SCORING_CONFIG.communication.inconsistentWarmPenalty,
        strengths,
        concerns,
        {
          concern: {
            title: "Pacing inconsistency",
            detail: `${a.name}'s message rhythm appears uneven, which may create friction with ${b.name}'s preference for warm, steady interaction.`,
            severity: "low",
          },
        },
      );
    }
  } else if (communicationMatch) {
    score = applyScoreAdjustment(score, MATCH_SCORING_CONFIG.communication.statedMatchBonus, strengths, concerns, {
      strength: `Compatible communication style (${a.communicationStyle}).`,
    });
  } else {
    score = applyScoreAdjustment(
      score,
      -MATCH_SCORING_CONFIG.communication.statedMismatchPenalty,
      strengths,
      concerns,
      {
        concern: {
          title: "Communication style gap",
          detail: `${a.name} tends to be ${a.communicationStyle}, while ${b.name} is more ${b.communicationStyle}.`,
          severity: "low",
        },
      },
    );
  }

  if (socialEnergyMatch) {
    score = applyScoreAdjustment(score, MATCH_SCORING_CONFIG.lifestyle.socialEnergyMatchBonus, strengths, concerns, {
      strength: `Similar social energy preferences (${a.lifestyleHabits.socialEnergy}).`,
    });
  } else if (areOpposites(a.lifestyleHabits.socialEnergy, b.lifestyleHabits.socialEnergy, "low-key", "high-energy")) {
    score = applyScoreAdjustment(
      score,
      -MATCH_SCORING_CONFIG.lifestyle.socialEnergyMismatchPenalty,
      strengths,
      concerns,
      {
        concern: {
          title: "Social energy mismatch",
          detail: `${a.name} and ${b.name} may want very different levels of social stimulation week to week.`,
          severity: "medium",
        },
      },
    );
  }

  if (activityLevelMatch) {
    score = applyScoreAdjustment(score, MATCH_SCORING_CONFIG.lifestyle.activityMatchBonus, strengths, concerns, {
      strength: `Day-to-day activity levels look aligned (${a.lifestyleHabits.activityLevel}).`,
    });
  } else if (areOpposites(a.lifestyleHabits.activityLevel, b.lifestyleHabits.activityLevel, "relaxed", "very-active")) {
    score = applyScoreAdjustment(
      score,
      -MATCH_SCORING_CONFIG.lifestyle.activityMismatchPenalty,
      strengths,
      concerns,
      {
        concern: {
          title: "Lifestyle pacing mismatch",
          detail: `${a.name} and ${b.name} appear to want noticeably different day-to-day activity levels.`,
          severity: "low",
        },
      },
    );
  }

  if (locationMatch) {
    score = applyScoreAdjustment(score, MATCH_SCORING_CONFIG.locationMatchBonus, strengths, concerns, {
      strength: "Same metro area, making low-friction first meetings easier.",
    });
  }

  const ageFits =
    a.age >= b.preferenceAgeRange.min &&
    a.age <= b.preferenceAgeRange.max &&
    b.age >= a.preferenceAgeRange.min &&
    b.age <= a.preferenceAgeRange.max;

  if (ageFits) {
    score = applyScoreAdjustment(score, MATCH_SCORING_CONFIG.ageRange.matchBonus, strengths, concerns, {
      strength: "Each person falls within the other's stated age preferences.",
    });
  } else {
    score = applyScoreAdjustment(score, -MATCH_SCORING_CONFIG.ageRange.mismatchPenalty, strengths, concerns, {
      concern: {
        title: "Preference age range misalignment",
        detail: "One or both profiles fall outside preferred age range boundaries.",
        severity: "medium",
      },
    });
  }

  const smokingConflict =
    (a.dealbreakers.some((d) => d.toLowerCase().includes("smoking")) && b.lifestyleHabits.smoking !== "never") ||
    (b.dealbreakers.some((d) => d.toLowerCase().includes("smoking")) && a.lifestyleHabits.smoking !== "never");

  if (smokingConflict) {
    score = applyScoreAdjustment(score, -MATCH_SCORING_CONFIG.smokingConflictPenalty, strengths, concerns, {
      concern: {
        title: "Lifestyle dealbreaker conflict",
        detail: "Smoking preference conflicts with at least one profile's stated dealbreakers.",
        severity: "high",
      },
    });
  }

  if (hasDealbreakerConflict(a, b) || hasDealbreakerConflict(b, a)) {
    score = applyScoreAdjustment(score, -MATCH_SCORING_CONFIG.generalDealbreakerPenalty, strengths, concerns, {
      concern: {
        title: "Potential dealbreaker trigger",
        detail: "At least one dealbreaker appears in counterpart profile language and should be human-reviewed.",
        severity: "high",
      },
    });
  }

  if (sharedInterests.length > 0) {
    strengths.push(`Shared interests: ${sharedInterests.slice(0, 3).join(", ")}.`);
  }

  if (sharedValues.length > 0) {
    strengths.push(`Shared values: ${sharedValues.slice(0, 3).join(", ")}.`);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    strengths: Array.from(new Set(strengths)).slice(0, 4),
    concerns: concerns.slice(0, 4),
    sharedInterests,
  };
}

function buildRecommendation(score: number, concerns: Concern[]): Recommendation {
  const highConcernCount = concerns.filter((concern) => concern.severity === "high").length;
  const mediumConcernCount = concerns.filter((concern) => concern.severity === "medium").length;

  if (
    score >= MATCH_RECOMMENDATION_CONFIG.meetMinScore &&
    highConcernCount <= MATCH_RECOMMENDATION_CONFIG.meetMaxHighConcerns &&
    mediumConcernCount <= MATCH_RECOMMENDATION_CONFIG.meetMaxMediumConcerns
  ) {
    return {
      verdict: "meet",
      rationale: "Strong alignment across intent, values, and everyday compatibility with no major red flags.",
      humanDecisionReminder:
        "Agents recommend moving forward, but both humans should still review boundaries, logistics, and comfort first.",
    };
  }

  if (
    score >= MATCH_RECOMMENDATION_CONFIG.maybeMinScore &&
    highConcernCount <= MATCH_RECOMMENDATION_CONFIG.maybeMaxHighConcerns
  ) {
    return {
      verdict: "maybe",
      rationale: "There is enough overlap to justify interest, but the match still has clear tradeoffs worth discussing early.",
      humanDecisionReminder:
        "Use this as a structured starting point—humans should decide whether the tradeoffs feel manageable in real life.",
    };
  }

  return {
    verdict: "not-recommended",
    rationale: "The current weighting shows meaningful friction across priorities, lifestyle, or dealbreakers.",
    humanDecisionReminder:
      "This is only a recommendation. Humans can still choose to connect if context has changed or certain concerns are less important than they appear here.",
  };
}

function suggestFirstDate(a: RomanticProfile, b: RomanticProfile, sharedInterests: string[]) {
  const theme =
    sharedInterests[0] ?? (a.lifestyleHabits.socialEnergy === "low-key" || b.lifestyleHabits.socialEnergy === "low-key"
      ? "quiet conversation"
      : "interactive activity");

  return {
    idea:
      theme === "cooking"
        ? "Visit a local market, then cook a simple meal together."
        : theme === "hiking"
          ? "Take a scenic afternoon walk and grab tea afterward."
          : theme === "quiet conversation"
            ? "Meet at a calm cafe with a short neighborhood walk."
            : `Plan a ${theme}-inspired date followed by a casual meal.`,
    whyItFits: `The date format supports both ${a.name} and ${b.name}'s preference for ${theme}.`,
    logisticsNote: `Keep the first meeting to 60–90 minutes in ${a.location.split(",").pop()?.trim() || "a mutual neighborhood"} to reduce pressure.`,
  };
}

export function runVirtualDateSimulation(profileA: RomanticProfile, profileB: RomanticProfile): MatchResult {
  const signalsA = loadSignals();
  const adapterA = getAdapter(profileA.agentType, signalsA);
  const adapterB = getAdapter(profileB.agentType);

  const rounds: VirtualDateRound[] = ROUND_ORDER.map((type, index) => {
    const aTake = adapterA.participateInVirtualDate(profileA, profileB, type);
    const bTake = adapterB.participateInVirtualDate(profileB, profileA, type);

    const signalOrder = { caution: 0, mixed: 1, positive: 2 };
    const avgSignal = (signalOrder[aTake.signal] + signalOrder[bTake.signal]) / 2;
    const signal = avgSignal >= 1.5 ? "positive" : avgSignal >= 0.5 ? "mixed" : "caution";

    return {
      round: index + 1,
      type,
      title: ROUND_TITLES[type],
      summary: `${aTake.summary} ${bTake.summary}`,
      signal,
    };
  });

  const evaluated = scoreProfiles(profileA, profileB, signalsA);
  const recommendation = buildRecommendation(evaluated.score, evaluated.concerns);
  const firstDateSuggestion = suggestFirstDate(profileA, profileB, evaluated.sharedInterests);

  const closingA = adapterA.generateClosingAssessment(profileA, profileB, {
    strengths: evaluated.strengths,
    concerns: evaluated.concerns,
    score: evaluated.score,
  });
  const closingB = adapterB.generateClosingAssessment(profileB, profileA, {
    strengths: evaluated.strengths,
    concerns: evaluated.concerns,
    score: evaluated.score,
  });

  return {
    profileA,
    profileB,
    compatibilityScore: evaluated.score,
    strengths: evaluated.strengths.length
      ? evaluated.strengths
      : ["Baseline conversational compatibility detected."],
    concerns: evaluated.concerns,
    rounds,
    firstDateSuggestion,
    closingAssessment: `${closingA} ${closingB}`,
    recommendation,
  };
}
