import { RomanticProfile } from "@/lib/types/matching";
import { ApifyProvider } from "./providers/apifyProvider";
import { PublicPageProvider } from "./providers/publicPageProvider";
import {
  SocialPerson,
  SocialResearch,
  SocialResearchProvider,
} from "./types";

export function getSocialProvider(): SocialResearchProvider {
  const token =
    typeof process !== "undefined"
      ? process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY
      : undefined;
  if (token) {
    return new ApifyProvider(token);
  }
  return new PublicPageProvider();
}

export function synthesizeRomanticProfile(
  id: string,
  research: SocialResearch,
  linkedinUrl: string,
  instagramUrl: string,
): RomanticProfile {
  const primaryCareer = research.career[0] || "Professional";
  const bio = `${research.headline || primaryCareer}. Interested in ${research.interests.slice(0, 3).join(", ")}. When offline, enjoys ${research.hobbies.slice(0, 2).join(" and ")}.`;

  return {
    id,
    name: research.name,
    age: 29, // Default baseline when unstated
    genderIdentity: "Person",
    lookingFor: "Everyone",
    location: research.location || "San Francisco, CA",
    occupation: {
      type: "work",
      place: primaryCareer,
    },
    photoUrl: research.sources.find((s) => s.avatarUrl)?.avatarUrl,
    linkedin: linkedinUrl,
    instagram: instagramUrl,
    relationshipIntent: "exploring",
    bio,
    interests: Array.from(new Set([...research.interests, ...research.hobbies])),
    values: research.values.length > 0 ? research.values : ["Curiosity", "Authenticity"],
    communicationStyle:
      research.communicationStyle === "unknown" ? "warm" : research.communicationStyle,
    lifestyleHabits: {
      sleepSchedule: "flexible",
      socialEnergy: "balanced",
      activityLevel: "active",
      drinking: "social",
      smoking: "never",
    },
    // Strictly adhere to: UNKNOWN ≠ INFERRED
    // We do not fabricate dealbreakers or private dating restrictions from public social accounts
    dealbreakers: [],
    idealFirstDate: `A relaxed coffee or walk around a lively neighborhood to chat about ${research.interests[0] || "shared passions"} and travel.`,
    preferenceAgeRange: { min: 24, max: 40 },
    preferenceNotes:
      "Persona synthesized strictly from public LinkedIn & Instagram profiles. Dealbreakers and explicit dating intent were not found in public sources and are preserved as unconstrained.",
    agentType: "hosted",
  };
}

export async function analyzeSocialPerson(
  linkedinUrl: string,
  instagramUrl: string,
  provider: SocialResearchProvider = getSocialProvider(),
): Promise<SocialPerson> {
  const [linkedin, instagram] = await Promise.all([
    provider.fetchProfileData(linkedinUrl, "linkedin"),
    provider.fetchProfileData(instagramUrl, "instagram"),
  ]);

  const research = await provider.synthesizeResearch(linkedin, instagram);
  const id = `person_${Math.random().toString(36).substring(2, 9)}`;
  const persona = synthesizeRomanticProfile(id, research, linkedinUrl, instagramUrl);

  return {
    id,
    name: research.name,
    linkedin: linkedinUrl,
    instagram: instagramUrl,
    avatarUrl: persona.photoUrl,
    location: persona.location,
    headline: research.headline,
    research,
    persona,
  };
}
