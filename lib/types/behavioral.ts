export type ParsedMessage = {
  timestamp: Date;
  sender: string;
  body: string;
  isSystem: boolean;
};

export type SignalConfidence = "low" | "medium" | "high";

export type SignalSensitivity = "shareable-summary" | "private-only";

export type WhatsAppSignalExtractionMetadata = {
  source: "whatsapp-export" | "fb-messenger-export";
  fileCount: number;
  parseErrors: number;
  detectedFormats: Array<"ios" | "android" | "fb-messenger" | "unknown">;
};

export type WhatsAppSignalFamilyMetadata = {
  confidence: SignalConfidence;
  sensitivity: SignalSensitivity;
  provenance: WhatsAppSignalExtractionMetadata & {
    userMessageCount: number;
    totalMessages: number;
  };
};

export type WhatsAppShareableSummary = {
  label: string;
  value: string;
  confidence: SignalConfidence;
};

export type WhatsAppCoverageSummary = {
  conversationCount: number;
  eligibleConversationCount: number;
  messageCount: number;
  ownerMessageCount: number;
  otherMessageCount: number;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  coverageQuality: SignalConfidence;
  warnings: string[];
};

export type WhatsAppResponseLatencyProfile = {
  medianMinutesToReply: number;
  p90MinutesToReply: number;
  weekdayVsWeekendShift: number;
  dayVsNightShift: number;
  consistency: SignalConfidence;
  confidence: SignalConfidence;
};

export type WhatsAppInitiationProfile = {
  ownerInitiationRatio: number;
  conversationRestartRatio: number;
  followThroughRatio: number;
  confidence: SignalConfidence;
};

export type WhatsAppMessageDepthProfile = {
  averageOwnerMessageLength: number;
  averageOtherMessageLength: number;
  longMessageRatio: number;
  questionAskingRatio: number;
  threadDepthIndex: number;
  confidence: SignalConfidence;
};

export type WhatsAppMirroringProfile = {
  tempoMirroring: number;
  lengthMirroring: number;
  emojiMirroring: number;
  punctuationMirroring: number;
  confidence: SignalConfidence;
};

export type WhatsAppConflictStyleProfile = {
  repairAfterTensionIndex: number;
  escalationTendency: number;
  avoidanceTendency: number;
  directnessAfterConflict: number;
  confidence: SignalConfidence;
  sensitivityClass: SignalSensitivity;
};

export type WhatsAppExpressivenessProfile = {
  emojiDensity: number;
  punctuationIntensity: number;
  emotionalVocabularyRange: number;
  humorSignalStrength: number;
  confidence: SignalConfidence;
};

export type WhatsAppCommunicationStyleProfile = {
  derivedStyle: WhatsAppSignals["derivedCommunicationStyle"];
  responseLatencyProfile: WhatsAppResponseLatencyProfile;
  initiationProfile: WhatsAppInitiationProfile;
  messageDepthProfile: WhatsAppMessageDepthProfile;
  mirroringProfile: WhatsAppMirroringProfile;
  conflictStyleProfile: WhatsAppConflictStyleProfile;
  expressivenessProfile: WhatsAppExpressivenessProfile;
};

export type WhatsAppConsistencyProfile = {
  responseConsistency: SignalConfidence;
  initiationConsistency: SignalConfidence;
  emotionalConsistency: SignalConfidence;
  confidence: SignalConfidence;
};

export type WhatsAppRelationshipStabilityProfile = {
  closeTieStabilityScore: number;
  activeDaysPerWeek: number;
  conversationLongevityDays: number;
  confidence: SignalConfidence;
};

export type WhatsAppReengagementProfile = {
  restartAfterGapRatio: number;
  ownerReengagementShare: number;
  confidence: SignalConfidence;
};

export type WhatsAppClosenessMaintenanceProfile = {
  questionAskingRatio: number;
  followUpRatio: number;
  acknowledgmentRatio: number;
  confidence: SignalConfidence;
};

export type WhatsAppAttachmentPatternProfile = {
  consistencyProfile: WhatsAppConsistencyProfile;
  relationshipStabilityProfile: WhatsAppRelationshipStabilityProfile;
  reengagementProfile: WhatsAppReengagementProfile;
  closenessMaintenanceProfile: WhatsAppClosenessMaintenanceProfile;
};

export type WhatsAppStabilityMetrics = {
  responseConsistency: SignalConfidence;
  relationshipStability: SignalConfidence;
  coverageQuality: SignalConfidence;
};

export type WhatsAppConversationSignalProfile = {
  conversationId: string;
  participantCount: number;
  inferredRelationshipType: "direct-message" | "group-chat";
  coverage: {
    messageCount: number;
    ownerMessageCount: number;
    otherMessageCount: number;
    activeDays: number;
    isSignalEligible: boolean;
    confidence: SignalConfidence;
  };
  communicationStyle: WhatsAppCommunicationStyleProfile;
  attachmentPattern: WhatsAppAttachmentPatternProfile;
  policyTags: SignalSensitivity[];
};

export type WhatsAppGlobalSignalProfile = {
  communicationStyle: WhatsAppCommunicationStyleProfile;
  attachmentPattern: WhatsAppAttachmentPatternProfile;
  stabilityMetrics: WhatsAppStabilityMetrics;
  coverage: WhatsAppCoverageSummary;
  shareableSummaryCandidates: Array<{
    summaryKey: string;
    summaryText: string;
    sourceSignalKeys: string[];
    confidence: SignalConfidence;
    approvedForAgentSharing: boolean;
  }>;
  privateOnlySignals: Array<{
    signalKey: string;
    value: string;
    reason: string;
    sensitivityClass: SignalSensitivity;
  }>;
};

export type WhatsAppSignals = {
  // Raw computed signals
  avgResponseLatencyMs: number;
  responseLatencyStdDevMs: number; // attachment consistency proxy: high stddev = inconsistent
  initiationRatio: number; // 0.0–1.0: fraction of conversation threads started by user
  avgMessageLength: number; // mean character count (media omitted treated as 0)
  longMessageRatio: number; // fraction of user messages with >50 chars
  emojiDensity: number; // emojis per message
  questionRatio: number; // fraction of user messages containing "?"
  hourlyDistribution: Record<number, number>; // hour 0–23 → message count

  // Close-tie stability: Jaccard similarity of top-3 contacts between first/second half of export
  closeTieStabilityScore: number; // 0.0–1.0

  // Derived categorical signals
  activeHoursProfile: "early-bird" | "night-owl" | "flexible";
  derivedCommunicationStyle: "direct" | "warm" | "playful" | "reflective" | "balanced";

  // Metadata
  totalMessages: number;
  userMessageCount: number;
  uniqueContacts: number;
  isLowConfidence: boolean; // true if userMessageCount < 20
  exportDateRange: { earliest: Date; latest: Date };
  analysedAt: Date;

  // Schema-alignment metadata
  extractionMetadata: WhatsAppSignalExtractionMetadata;
  signalFamilyMetadata: {
    communicationStyle: WhatsAppSignalFamilyMetadata;
    responsiveness: WhatsAppSignalFamilyMetadata;
    activeHours: WhatsAppSignalFamilyMetadata;
    relationshipPatterns: WhatsAppSignalFamilyMetadata;
  };
  shareableSummary: WhatsAppShareableSummary[];
  coverageSummary: WhatsAppCoverageSummary;
  conversationProfiles: WhatsAppConversationSignalProfile[];
  globalProfile: WhatsAppGlobalSignalProfile;
};

export type SelfAwarenessGap = {
  statedCommunicationStyle: string;
  derivedCommunicationStyle: string;
  statedSleepSchedule: string;
  derivedSleepSchedule: string;
  communicationStyleMatch: boolean;
  sleepScheduleMatch: boolean;
  gapScore: number; // 0.0–1.0: fraction of measured fields that differ
};
