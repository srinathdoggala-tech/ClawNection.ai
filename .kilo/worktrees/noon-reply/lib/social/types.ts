import type { CommunicationStyle, RomanticProfile } from "@/lib/types/matching";

export type SocialSourcePlatform = "linkedin" | "instagram";

export type SocialSource = {
  platform: SocialSourcePlatform;
  url: string;
  fetchedAt: string;
  title?: string;
  description?: string;
  text?: string;
  handle?: string;
  avatarUrl?: string;
  statusCode?: number;
  blockedOrRestricted?: boolean;
};

export type FieldProvenance = {
  field: string;
  sourcePlatform: "linkedin" | "instagram" | "combined";
  sourceUrl: string;
  snippet?: string;
  confidence: number;
};

export type SocialResearch = {
  name: string;
  headline?: string;
  location?: string;
  sources: SocialSource[];

  career: string[];
  education: string[];
  interests: string[];
  hobbies: string[];
  values: string[];
  communicationStyle: CommunicationStyle | "unknown";

  lifestyleSignals: string[];
  personalitySignals: string[];
  datingRelevantSignals: string[];

  confidence: {
    career: number;
    interests: number;
    hobbies: number;
    values: number;
    personality: number;
  };

  provenance?: FieldProvenance[];

  // Fields explicitly not found or unsupported by the 2 permitted public sources
  unsupportedFields: string[];
};

export type SocialPerson = {
  id: string;
  name: string;
  linkedin: string;
  instagram: string;
  avatarUrl?: string;
  location?: string;
  headline?: string;
  verifiedSourcePair?: boolean;
  sourceAuditNote?: string;
  research: SocialResearch;
  persona: RomanticProfile;
};

export type AnalysisStage =
  | "linkedin_loaded"
  | "instagram_loaded"
  | "career_extracted"
  | "interests_extracted"
  | "hobbies_extracted"
  | "personality_extracted"
  | "persona_synthesized";

export type StageProgress = {
  id: AnalysisStage;
  label: string;
  status: "pending" | "running" | "done" | "skipped";
  detail?: string;
};

export type SourceBackedScoreBreakdown = {
  profileCompatibility: number; // 0 - 100 based on interests, hobbies, career, values
  agentDateScore: number;       // 0 - 100 based on simulated conversation chemistry
  reciprocalInterest: number;   // 0 - 100 based on mutual verdicts
  finalCompatibility: number;   // weighted composite score
  sharedInterests: string[];
  sharedHobbies: string[];
  sharedValues: string[];
  careerOverlap: string[];
  communicationSynergy: string;
  whyTheyMatched: string[];
  cautionPoints: string[];
};

export interface SocialResearchProvider {
  name: string;
  fetchProfileData(url: string, platform: SocialSourcePlatform): Promise<SocialSource>;
  synthesizeResearch(linkedin: SocialSource, instagram: SocialSource): Promise<SocialResearch>;
}
