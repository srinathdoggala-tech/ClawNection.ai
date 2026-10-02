import {
  Concern,
  Recommendation,
  RomanticProfile,
} from "@/lib/types/matching";
import { WhatsAppSignals } from "@/lib/types/behavioral";

export type ScoringWeights = {
  baseScore: number;
  sharedInterestPoints: number;
  sharedInterestMax: number;
  sharedValuePoints: number;
  sharedValueMax: number;
  intentMatchBonus: number;
  intentMismatchPenalty: number;
  commStyleMatchBonus: number;
  commStyleMismatchPenalty: number;
  locationBonus: number;
  ageFitBonus: number;
  ageMismatchPenalty: number;
  smokingDealbreaker: number;
  generalDealbreaker: number;
  latencyFastBonus: number;
  latencySlowBonus: number;
  inconsistentPenalty: number;
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  baseScore: 50,
  sharedInterestPoints: 6,
  sharedInterestMax: 18,
  sharedValuePoints: 8,
  sharedValueMax: 24,
  intentMatchBonus: 12,
  intentMismatchPenalty: 8,
  commStyleMatchBonus: 8,
  commStyleMismatchPenalty: 4,
  locationBonus: 6,
  ageFitBonus: 6,
  ageMismatchPenalty: 10,
  smokingDealbreaker: 18,
  generalDealbreaker: 12,
  latencyFastBonus: 3,
  latencySlowBonus: 3,
  inconsistentPenalty: 3,
};

export function overlap(a: string[], b: string[]) {
  return a.filter((item) => b.includes(item));
}

export function hasDealbreakerConflict(a: RomanticProfile, b: RomanticProfile) {
  const bText = `${b.bio} ${b.interests.join(" ")} ${b.values.join(" ")} ${b.lifestyleHabits.smoking}`.toLowerCase();
  return a.dealbreakers.some((dealbreaker) => bText.includes(dealbreaker.toLowerCase()));
}

export function scoreProfiles(
  a: RomanticProfile,
  b: RomanticProfile,
  signalsA: WhatsAppSignals | null = null,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
) {
  let score = weights.baseScore;
  const strengths: string[] = [];
  const concerns: Concern[] = [];

  const sharedInterests = overlap(a.interests, b.interests);
  const sharedValues = overlap(a.values, b.values);
  const intentMatch = a.relationshipIntent === b.relationshipIntent;
  const communicationMatch = a.communicationStyle === b.communicationStyle;
  const locationMatch = a.location.split(",").pop()?.trim() === b.location.split(",").pop()?.trim();

  score += Math.min(sharedInterests.length * weights.sharedInterestPoints, weights.sharedInterestMax);
  score += Math.min(sharedValues.length * weights.sharedValuePoints, weights.sharedValueMax);

  if (intentMatch) {
    score += weights.intentMatchBonus;
    strengths.push("Aligned relationship intent and pacing expectations.");
  } else {
    score -= weights.intentMismatchPenalty;
    concerns.push({
      title: "Intent mismatch",
      detail: `${a.name} seeks ${a.relationshipIntent} while ${b.name} currently prefers ${b.relationshipIntent}.`,
      severity: "medium",
    });
  }

  if (signalsA && !signalsA.isLowConfidence) {
    const derivedStyle = signalsA.derivedCommunicationStyle;
    if (derivedStyle === b.communicationStyle) {
      score += weights.commStyleMatchBonus;
      strengths.push(`Behavioral communication style (${derivedStyle}) aligns with counterpart.`);
    } else {
      score -= weights.commStyleMismatchPenalty;
      concerns.push({
        title: "Communication style gap",
        detail: `Behavioral analysis suggests ${a.name} communicates as ${derivedStyle}, while ${b.name} is more ${b.communicationStyle}.`,
        severity: "low",
      });
    }

    const latencyMin = signalsA.avgResponseLatencyMs / 60_000;
    const isInconsistent = signalsA.responseLatencyStdDevMs > signalsA.avgResponseLatencyMs * 1.5;
    if (latencyMin < 30 && (b.communicationStyle === "direct" || b.communicationStyle === "warm")) {
      score += weights.latencyFastBonus;
    }
    if (latencyMin > 240 && b.communicationStyle === "reflective") {
      score += weights.latencySlowBonus;
    }
    if (isInconsistent && b.communicationStyle === "warm") {
      score -= weights.inconsistentPenalty;
    }
  } else if (communicationMatch) {
    score += weights.commStyleMatchBonus;
    strengths.push(`Compatible communication style (${a.communicationStyle}).`);
  } else {
    score -= weights.commStyleMismatchPenalty;
    concerns.push({
      title: "Communication style gap",
      detail: `${a.name} tends to be ${a.communicationStyle}, while ${b.name} is more ${b.communicationStyle}.`,
      severity: "low",
    });
  }

  if (locationMatch) {
    score += weights.locationBonus;
    strengths.push("Same metro area, making low-friction first meetings easier.");
  }

  const ageFits =
    a.age >= b.preferenceAgeRange.min &&
    a.age <= b.preferenceAgeRange.max &&
    b.age >= a.preferenceAgeRange.min &&
    b.age <= a.preferenceAgeRange.max;

  if (ageFits) {
    score += weights.ageFitBonus;
  } else {
    score -= weights.ageMismatchPenalty;
    concerns.push({
      title: "Preference age range misalignment",
      detail: "One or both profiles fall outside preferred age range boundaries.",
      severity: "medium",
    });
  }

  const smokingConflict =
    (a.dealbreakers.some((d) => d.toLowerCase().includes("smoking")) && b.lifestyleHabits.smoking !== "never") ||
    (b.dealbreakers.some((d) => d.toLowerCase().includes("smoking")) && a.lifestyleHabits.smoking !== "never");

  if (smokingConflict) {
    score -= weights.smokingDealbreaker;
    concerns.push({
      title: "Lifestyle dealbreaker conflict",
      detail: "Smoking preference conflicts with at least one profile's stated dealbreakers.",
      severity: "high",
    });
  }

  if (hasDealbreakerConflict(a, b) || hasDealbreakerConflict(b, a)) {
    score -= weights.generalDealbreaker;
    concerns.push({
      title: "Potential dealbreaker trigger",
      detail: "At least one dealbreaker appears in counterpart profile language and should be human-reviewed.",
      severity: "high",
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
    strengths: strengths.slice(0, 4),
    concerns: concerns.slice(0, 4),
    sharedInterests,
  };
}

export function buildRecommendation(score: number, concerns: Concern[]): Recommendation {
  if (score >= 75 && concerns.every((concern) => concern.severity !== "high")) {
    return {
      verdict: "meet",
      rationale: "Strong alignment across intent, values, and practical lifestyle compatibility.",
      humanDecisionReminder:
        "Agents recommend moving forward, but both humans should review boundaries and comfort first.",
    };
  }

  if (score >= 55) {
    return {
      verdict: "maybe",
      rationale: "Promising overlap with a few friction points worth discussing before an in-person date.",
      humanDecisionReminder:
        "Use this as a structured starting point—humans should decide whether concerns feel manageable.",
    };
  }

  return {
    verdict: "not-recommended",
    rationale: "Multiple mismatch signals suggest low-likelihood in-person compatibility right now.",
    humanDecisionReminder:
      "This is only a recommendation. Humans can still choose to connect if context has changed.",
  };
}

export function suggestFirstDate(a: RomanticProfile, b: RomanticProfile, sharedInterests: string[]) {
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
            ? "Meet at a calm café with a short neighborhood walk."
            : `Plan a ${theme}-inspired date followed by a casual meal.`,
    whyItFits: `The date format supports both ${a.name} and ${b.name}'s preference for ${theme}.`,
    logisticsNote: `Keep the first meeting to 60–90 minutes in ${a.location.split(",").pop()?.trim() || "a mutual neighborhood"} to reduce pressure.`,
  };
}
