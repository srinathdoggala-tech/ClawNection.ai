import { SocialPerson, SourceBackedScoreBreakdown } from "./types";

function overlap(a: string[] = [], b: string[] = []): string[] {
  const bLower = b.map((item) => item.toLowerCase());
  return a.filter((item) => bLower.includes(item.toLowerCase()));
}

export function computeSourceBackedScore(
  personA: SocialPerson,
  personB: SocialPerson,
  customDateScore?: number,
): SourceBackedScoreBreakdown {
  const rA = personA.research;
  const rB = personB.research;

  const sharedInterests = overlap(rA.interests, rB.interests);
  const sharedHobbies = overlap(rA.hobbies, rB.hobbies);
  const sharedValues = overlap(rA.values, rB.values);
  const careerOverlap = overlap(rA.career, rB.career);

  // Profile compatibility (0-100) based strictly on source-backed public signals
  let profileScore = 50;
  profileScore += Math.min(sharedInterests.length * 8, 20);
  profileScore += Math.min(sharedHobbies.length * 7, 15);
  profileScore += Math.min(sharedValues.length * 6, 12);
  if (careerOverlap.length > 0) profileScore += 6;
  if (rA.communicationStyle === rB.communicationStyle && rA.communicationStyle !== "unknown") {
    profileScore += 5;
  }
  profileScore = Math.max(45, Math.min(96, profileScore));

  // Agent date conversation score (simulated or custom provided)
  const agentDateScore =
    customDateScore ??
    Math.round(
      68 +
        sharedInterests.length * 4 +
        sharedHobbies.length * 3 +
        (Math.abs(personA.name.length - personB.name.length) % 10),
    );

  // Reciprocal agent verdict interest
  const agentARating = Math.min(9.8, Math.max(6.5, (agentDateScore + 2) / 10));
  const agentBRating = Math.min(9.6, Math.max(6.2, (agentDateScore - 1) / 10));
  const reciprocalInterest = Math.round(((agentARating + agentBRating) / 2) * 10);

  // Composite final compatibility
  const finalCompatibility = Math.round(
    profileScore * 0.35 + agentDateScore * 0.4 + reciprocalInterest * 0.25,
  );

  const whyTheyMatched: string[] = [];
  if (sharedInterests.length > 0) {
    whyTheyMatched.push(`Shared interests in ${sharedInterests.slice(0, 3).join(", ")}`);
  }
  if (sharedHobbies.length > 0) {
    whyTheyMatched.push(`Compatible hobbies: ${sharedHobbies.slice(0, 2).join(" & ")}`);
  }
  if (sharedValues.length > 0) {
    whyTheyMatched.push(`Mutual grounding in ${sharedValues.slice(0, 2).join(" and ")}`);
  }
  if (careerOverlap.length > 0) {
    whyTheyMatched.push(`Professional alignment in ${careerOverlap[0]}`);
  }
  if (whyTheyMatched.length === 0) {
    whyTheyMatched.push("Complementary background curiosity and open conversational rhythms");
  }

  const cautionPoints: string[] = [];
  if (rA.communicationStyle !== rB.communicationStyle && rA.communicationStyle !== "unknown") {
    cautionPoints.push(
      `Different communication signals: ${personA.name} leans ${rA.communicationStyle}, while ${personB.name} is ${rB.communicationStyle}.`,
    );
  }
  cautionPoints.push(
    "Private boundaries, dealbreakers, and relationship intents were unstated in public profiles.",
  );

  return {
    profileCompatibility: profileScore,
    agentDateScore: Math.min(98, agentDateScore),
    reciprocalInterest: Math.min(96, reciprocalInterest),
    finalCompatibility: Math.min(98, finalCompatibility),
    sharedInterests,
    sharedHobbies,
    sharedValues,
    careerOverlap,
    communicationSynergy: `${rA.communicationStyle} ↔ ${rB.communicationStyle}`,
    whyTheyMatched,
    cautionPoints,
  };
}
