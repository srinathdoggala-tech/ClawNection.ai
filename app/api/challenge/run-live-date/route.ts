import { NextRequest, NextResponse } from "next/server";
import { runVirtualDateSimulation } from "@/lib/matching/virtualDate";
import { computeSourceBackedScore } from "@/lib/social/sourceScoring";
import { SocialPerson } from "@/lib/social/types";
import { RomanticProfile } from "@/lib/types/matching";

type TurnDialogue = {
  round: number;
  type: "introductions" | "intentions" | "lifestyle" | "values" | "communication" | "chemistry";
  title: string;
  agentAMessage: string;
  agentBMessage: string;
  signal: "positive" | "mixed" | "caution";
};

function generateLiveUtterance(
  speaker: RomanticProfile,
  counterpart: RomanticProfile,
  round: "introductions" | "intentions" | "lifestyle" | "values" | "communication" | "chemistry",
): string {
  const comm = speaker.communicationStyle || "warm";
  const career = speaker.occupation?.place || "creative work";
  const shared = speaker.interests.filter((i) => counterpart.interests.includes(i));
  const sharedValues = speaker.values.filter((v) => counterpart.values.includes(v));

  if (round === "introductions") {
    if (comm === "direct") {
      return `Hello ${counterpart.name}'s Agent. ${speaker.name} focuses heavily on ${career}. Their public signals reflect active commitment to ${speaker.interests.slice(0, 2).join(" and ") || "independent projects"}.`;
    }
    if (comm === "reflective") {
      return `Greetings. Representing ${speaker.name}—their public footprint reveals a quiet dedication to ${career} and an appreciation for ${speaker.interests[0] || "intellectual craft"}.`;
    }
    return `Hi there! I'm ${speaker.name}'s Agent. ${speaker.name} spends their days in ${career} and loves spending weekends with ${speaker.interests.slice(0, 2).join(" and ") || "new adventures"}.`;
  }

  if (round === "intentions") {
    return `Because our source analysis strictly adheres to verified public data, ${speaker.name}'s dating intent was unstated publicly. What we do know is they look for genuine curiosity and mutual respect rather than artificial pressure.`;
  }

  if (round === "lifestyle") {
    return `${speaker.name}'s public lifestyle signals suggest an active, balanced weekly routine in ${speaker.location}. They prioritize ${speaker.interests[0] || "focused pursuits"} and need someone comfortable with independent daytime focus.`;
  }

  if (round === "values") {
    if (sharedValues.length > 0) {
      return `I see strong values alignment: both ${speaker.name} and ${counterpart.name} prioritize ${sharedValues.slice(0, 2).join(" and ")}. For ${speaker.name}, integrity in their work and relationships is non-negotiable.`;
    }
    return `${speaker.name} is deeply guided by ${speaker.values.slice(0, 2).join(" and ") || "authenticity and growth"}. They appreciate counterparts who hold genuine conviction in their personal passions.`;
  }

  if (round === "communication") {
    return `${speaker.name} communicates with a ${comm} conversational rhythm. They value clarity, thoughtful follow-through, and sincere engagement without passive games.`;
  }

  // Chemistry
  if (shared.length > 0) {
    return `There is clear chemistry around mutual passions for ${shared.slice(0, 2).join(" and ")}. Our agents agree this warrants an in-person meeting.`;
  }
  return `The conversational rapport was grounded and respectful. We recommend a low-pressure first date in a calm cafe or neighbourhood walk.`;
}

export async function POST(req: NextRequest) {
  let body: {
    personAId?: string;
    personBId?: string;
    personA?: SocialPerson;
    personB?: SocialPerson;
    profileA?: RomanticProfile;
    profileB?: RomanticProfile;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const { getDemoPeople } = await import("@/lib/data/demoPeople");
  const allPeople = getDemoPeople();
  const resolvedPersonA = body.personA || (body.personAId ? allPeople.find((p) => p.id === body.personAId) : undefined);
  const resolvedPersonB = body.personB || (body.personBId ? allPeople.find((p) => p.id === body.personBId) : undefined);

  const profileA = body.profileA || resolvedPersonA?.persona;
  const profileB = body.profileB || resolvedPersonB?.persona;

  if (!profileA || !profileB) {
    return NextResponse.json(
      { error: "missing_profiles", message: "Both profileA/personA and profileB/personB are required to run a live date." },
      { status: 400 },
    );
  }

  try {
    // 1. Invoke the existing virtual date simulation engine from lib/matching/virtualDate.ts
    const simulationResult = runVirtualDateSimulation(profileA, profileB);

    // 2. Generate the 6 live round turns based on the profiles' actual signals
    const roundTypes: Array<"introductions" | "intentions" | "lifestyle" | "values" | "communication" | "chemistry"> = [
      "introductions",
      "intentions",
      "lifestyle",
      "values",
      "communication",
      "chemistry",
    ];

    const turns: TurnDialogue[] = roundTypes.map((type, idx) => {
      const existingRound = simulationResult.rounds[idx];
      const roundNum = idx + 1;
      const title = existingRound ? existingRound.title : `Round ${roundNum} · ${type.toUpperCase()}`;
      const signal = existingRound ? existingRound.signal : "positive";

      const aMsg = generateLiveUtterance(profileA, profileB, type);
      const bMsg = generateLiveUtterance(profileB, profileA, type);

      return {
        round: roundNum,
        type,
        title,
        agentAMessage: aMsg,
        agentBMessage: bMsg,
        signal,
      };
    });

    // 3. Compute both Clawnection legacy and Source-Backed Composite Scores
    const customDateScore = Math.round(
      Math.min(98, Math.max(68, simulationResult.compatibilityScore + 10)),
    );

    const resolvedPersonA: SocialPerson = {
      id: profileA.id,
      name: body.personA?.name || (body.personA as unknown as { person?: { name?: string } })?.person?.name || profileA.name,
      linkedin: profileA.linkedin || body.personA?.linkedin || "",
      instagram: profileA.instagram || body.personA?.instagram || "",
      location: profileA.location || "San Francisco, CA",
      headline: body.personA?.headline || profileA.occupation?.place || "Professional",
      research: body.personA?.research || {
        name: profileA.name,
        sources: [],
        career: [profileA.occupation?.place || "Professional"],
        education: [],
        interests: profileA.interests,
        hobbies: profileA.interests.slice(0, 2),
        values: profileA.values,
        communicationStyle: profileA.communicationStyle,
        lifestyleSignals: [],
        personalitySignals: [],
        datingRelevantSignals: [],
        confidence: { career: 0.9, interests: 0.85, hobbies: 0.85, values: 0.8, personality: 0.8 },
        unsupportedFields: ["relationshipIntent", "dealbreakers"],
      },
      persona: profileA,
    };

    const resolvedPersonB: SocialPerson = {
      id: profileB.id,
      name: body.personB?.name || (body.personB as unknown as { person?: { name?: string } })?.person?.name || profileB.name,
      linkedin: profileB.linkedin || body.personB?.linkedin || "",
      instagram: profileB.instagram || body.personB?.instagram || "",
      location: profileB.location || "San Francisco, CA",
      headline: body.personB?.headline || profileB.occupation?.place || "Professional",
      research: body.personB?.research || {
        name: profileB.name,
        sources: [],
        career: [profileB.occupation?.place || "Professional"],
        education: [],
        interests: profileB.interests,
        hobbies: profileB.interests.slice(0, 2),
        values: profileB.values,
        communicationStyle: profileB.communicationStyle,
        lifestyleSignals: [],
        personalitySignals: [],
        datingRelevantSignals: [],
        confidence: { career: 0.9, interests: 0.85, hobbies: 0.85, values: 0.8, personality: 0.8 },
        unsupportedFields: ["relationshipIntent", "dealbreakers"],
      },
      persona: profileB,
    };

    const scoreBreakdown = computeSourceBackedScore(resolvedPersonA, resolvedPersonB, customDateScore);

    // 4. Formulate independent agent verdicts
    const ratingA = Number(((scoreBreakdown.agentDateScore + 3) / 10).toFixed(1));
    const ratingB = Number(((scoreBreakdown.agentDateScore + 1) / 10).toFixed(1));
    const wouldMeet = simulationResult.recommendation.verdict !== "not-recommended";

    const verdictA = {
      wouldMeetIrl: wouldMeet,
      rating: Math.min(10, Math.max(6, ratingA)),
      reasoning: `${profileA.name}'s Agent: ${simulationResult.recommendation.rationale} Strongest points: ${simulationResult.strengths.slice(0, 2).join("; ") || "Compatible background and mutual curiosity"}.`,
    };

    const verdictB = {
      wouldMeetIrl: wouldMeet,
      rating: Math.min(10, Math.max(6, ratingB)),
      reasoning: `${profileB.name}'s Agent: Recommends moving forward based on aligned values (${profileB.values.slice(0, 2).join(", ")}) and mutual respect for independent focus.`,
    };

    return NextResponse.json({
      dateId: `date_live_${Math.random().toString(36).substring(2, 9)}`,
      turns,
      verdictA,
      verdictB,
      legacyMatchResult: simulationResult,
      scoreBreakdown,
      firstDateSuggestion: simulationResult.firstDateSuggestion,
      mode: "live_virtual_date",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "date_simulation_failed",
        message: err instanceof Error ? err.message : "Failed to execute virtual date simulation.",
      },
      { status: 500 },
    );
  }
}
