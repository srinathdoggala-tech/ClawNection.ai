export type AgentType = "hosted" | "external-mock";

export type RelationshipIntent =
  | "long-term"
  | "serious-dating"
  | "exploring"
  | "casual"
  | "friendship-first";

export type CommunicationStyle =
  | "direct"
  | "warm"
  | "playful"
  | "reflective"
  | "balanced";

export type LifestyleHabits = {
  sleepSchedule: "early-bird" | "night-owl" | "flexible";
  socialEnergy: "low-key" | "balanced" | "high-energy";
  activityLevel: "relaxed" | "active" | "very-active";
  drinking: "never" | "social" | "regular";
  smoking: "never" | "occasionally" | "regular";
};

export type InterestProfile = {
  core: string[];
  passions: string[];
  tags: string[];
};

export type Occupation = {
  type: "work" | "school";
  place: string;
};

export type RomanticProfile = {
  id: string;
  name: string;
  lastName?: string;
  age: number;
  phoneNumber?: string;
  genderIdentity: string;
  lookingFor: string;
  location: string;
  occupation?: Occupation;
  photoUrl?: string;
  instagram?: string;
  linkedin?: string;
  relationshipIntent: RelationshipIntent;
  bio: string;
  interests: string[];
  interestProfile?: InterestProfile;
  values: string[];
  communicationStyle: CommunicationStyle;
  lifestyleHabits: LifestyleHabits;
  dealbreakers: string[];
  idealFirstDate: string;
  preferenceAgeRange: {
    min: number;
    max: number;
  };
  preferenceNotes: string;
  agentType: AgentType;
  // Soft-signal fields (added in migration 0007). These capture the
  // middle band between explicit dealbreakers and broad compatibility
  // signals — the territory where most real first-date "no" verdicts
  // live. Optional everywhere so existing personas continue to work.
  petPeeves?: string[];
  currentLifeContext?: string;
  wantsToAvoid?: string[];
  pastPatternToBreak?: string;
};

export type VirtualDateRoundType =
  | "introductions"
  | "intentions"
  | "lifestyle"
  | "values"
  | "communication"
  | "fun-chemistry";

export type VirtualDateRound = {
  round: number;
  type: VirtualDateRoundType;
  title: string;
  summary: string;
  signal: "positive" | "mixed" | "caution";
};

export type Concern = {
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
};

export type FirstDateSuggestion = {
  idea: string;
  whyItFits: string;
  logisticsNote: string;
};

export type Recommendation = {
  verdict: "meet" | "maybe" | "not-recommended";
  rationale: string;
  humanDecisionReminder: string;
};

export type MatchResult = {
  profileA: RomanticProfile;
  profileB: RomanticProfile;
  compatibilityScore: number;
  strengths: string[];
  concerns: Concern[];
  rounds: VirtualDateRound[];
  firstDateSuggestion: FirstDateSuggestion;
  closingAssessment: string;
  recommendation: Recommendation;
};
