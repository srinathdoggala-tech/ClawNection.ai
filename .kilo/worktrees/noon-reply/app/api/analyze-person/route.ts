import { NextRequest, NextResponse } from "next/server";
import { getDemoPeople } from "@/lib/data/demoPeople";
import { analyzeSocialPerson } from "@/lib/social/analyzer";

function isValidHttpUrl(stringUrl: string): boolean {
  try {
    const url = new URL(stringUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: { linkedinUrl?: string; instagramUrl?: string; forceLive?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const linkedinUrl = body.linkedinUrl?.trim();
  const instagramUrl = body.instagramUrl?.trim();

  if (!linkedinUrl || !instagramUrl) {
    return NextResponse.json(
      {
        error: "missing_fields",
        message: "Both linkedinUrl and instagramUrl are required.",
      },
      { status: 400 },
    );
  }

  // Validate URL format
  if (!isValidHttpUrl(linkedinUrl)) {
    return NextResponse.json(
      {
        error: "invalid_linkedin_url",
        message: "LinkedIn URL must be a valid URL starting with https:// (e.g. https://www.linkedin.com/in/username).",
      },
      { status: 400 },
    );
  }

  if (!isValidHttpUrl(instagramUrl)) {
    return NextResponse.json(
      {
        error: "invalid_instagram_url",
        message: "Instagram URL must be a valid URL starting with https:// (e.g. https://www.instagram.com/username).",
      },
      { status: 400 },
    );
  }

  // Validate domain integrity
  const lowerLi = linkedinUrl.toLowerCase();
  const lowerIg = instagramUrl.toLowerCase();

  if (!lowerLi.includes("linkedin.com")) {
    return NextResponse.json(
      {
        error: "invalid_linkedin_domain",
        message: "The LinkedIn URL must belong to the linkedin.com domain (e.g. https://www.linkedin.com/in/username).",
      },
      { status: 400 },
    );
  }

  if (!lowerIg.includes("instagram.com")) {
    return NextResponse.json(
      {
        error: "invalid_instagram_domain",
        message: "The Instagram URL must belong to the instagram.com domain (e.g. https://www.instagram.com/username).",
      },
      { status: 400 },
    );
  }

  // Fast path for instant demo evaluation if matching precomputed cohort and not forcing live
  if (!body.forceLive) {
    const demoList = getDemoPeople();
    const match = demoList.find(
      (p) =>
        p.linkedin.toLowerCase().includes(lowerLi) ||
        lowerLi.includes(p.linkedin.toLowerCase()) ||
        p.instagram.toLowerCase().includes(lowerIg) ||
        lowerIg.includes(p.instagram.toLowerCase()),
    );

    if (match) {
      return NextResponse.json({
        person: {
          id: match.id,
          name: match.name,
          linkedin: match.linkedin,
          instagram: match.instagram,
          headline: match.headline,
          location: match.location,
        },
        research: {
          career: match.research.career,
          education: match.research.education,
          interests: match.research.interests,
          hobbies: match.research.hobbies,
          values: match.research.values,
          communicationStyle: match.research.communicationStyle,
          lifestyleSignals: match.research.lifestyleSignals,
          personalitySignals: match.research.personalitySignals,
          datingRelevantSignals: match.research.datingRelevantSignals,
          confidence: match.research.confidence,
          provenance: match.research.provenance ?? [
            {
              field: "career",
              sourcePlatform: "linkedin",
              sourceUrl: match.linkedin,
              snippet: match.headline,
              confidence: 0.95,
            },
            {
              field: "interests",
              sourcePlatform: "combined",
              sourceUrl: match.linkedin,
              snippet: match.research.interests.slice(0, 3).join(", "),
              confidence: 0.9,
            },
            {
              field: "hobbies",
              sourcePlatform: "instagram",
              sourceUrl: match.instagram,
              snippet: match.research.hobbies.slice(0, 2).join(", "),
              confidence: 0.92,
            },
          ],
          unsupportedFields: match.research.unsupportedFields,
        },
        persona: match.persona,
        mode: "precomputed_demo",
      });
    }
  }

  // Live research pipeline: fetch, extract, synthesize via provider abstraction
  try {
    const analyzed = await analyzeSocialPerson(linkedinUrl, instagramUrl);
    return NextResponse.json({
      person: {
        id: analyzed.id,
        name: analyzed.name,
        linkedin: analyzed.linkedin,
        instagram: analyzed.instagram,
        headline: analyzed.headline,
        location: analyzed.location,
      },
      research: {
        career: analyzed.research.career,
        education: analyzed.research.education,
        interests: analyzed.research.interests,
        hobbies: analyzed.research.hobbies,
        values: analyzed.research.values,
        communicationStyle: analyzed.research.communicationStyle,
        lifestyleSignals: analyzed.research.lifestyleSignals,
        personalitySignals: analyzed.research.personalitySignals,
        datingRelevantSignals: analyzed.research.datingRelevantSignals,
        confidence: analyzed.research.confidence,
        provenance: analyzed.research.provenance,
        unsupportedFields: analyzed.research.unsupportedFields,
      },
      persona: analyzed.persona,
      mode: "live_extraction",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "analysis_failed",
        message: err instanceof Error ? err.message : "Unable to analyze the supplied social profiles.",
      },
      { status: 502 },
    );
  }
}
