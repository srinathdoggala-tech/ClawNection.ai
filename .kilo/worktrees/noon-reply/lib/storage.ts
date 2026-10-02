import { MatchResult, RomanticProfile } from "@/lib/types/matching";
import { SelfAwarenessGap, WhatsAppSignals } from "@/lib/types/behavioral";

export const LOCAL_PROFILE_KEY = "clawnection.profile.v1";
export const LOCAL_RESULT_KEY = "clawnection.lastResult.v1";
export const LOCAL_SIGNALS_KEY = "clawnection.signals.v1";
const LOCAL_GAP_KEY = "clawnection.selfAwarenessGap.v1";

function reviveSignals(parsed: WhatsAppSignals): WhatsAppSignals {
  parsed.exportDateRange.earliest = new Date(parsed.exportDateRange.earliest);
  parsed.exportDateRange.latest = new Date(parsed.exportDateRange.latest);
  parsed.analysedAt = new Date(parsed.analysedAt);

  if (!parsed.extractionMetadata) {
    parsed.extractionMetadata = {
      source: "whatsapp-export",
      fileCount: 1,
      parseErrors: 0,
      detectedFormats: ["unknown"],
    };
  }

  if (!parsed.signalFamilyMetadata) {
    parsed.signalFamilyMetadata = {
      communicationStyle: {
        confidence: parsed.isLowConfidence ? "low" : "medium",
        sensitivity: "shareable-summary",
        provenance: {
          ...parsed.extractionMetadata,
          userMessageCount: parsed.userMessageCount,
          totalMessages: parsed.totalMessages,
        },
      },
      responsiveness: {
        confidence: parsed.isLowConfidence ? "low" : "medium",
        sensitivity: "shareable-summary",
        provenance: {
          ...parsed.extractionMetadata,
          userMessageCount: parsed.userMessageCount,
          totalMessages: parsed.totalMessages,
        },
      },
      activeHours: {
        confidence: parsed.isLowConfidence ? "low" : "medium",
        sensitivity: "shareable-summary",
        provenance: {
          ...parsed.extractionMetadata,
          userMessageCount: parsed.userMessageCount,
          totalMessages: parsed.totalMessages,
        },
      },
      relationshipPatterns: {
        confidence: parsed.isLowConfidence ? "low" : "medium",
        sensitivity: "private-only",
        provenance: {
          ...parsed.extractionMetadata,
          userMessageCount: parsed.userMessageCount,
          totalMessages: parsed.totalMessages,
        },
      },
    };
  }

  if (!parsed.shareableSummary) {
    parsed.shareableSummary = [];
  }

  if (!parsed.coverageSummary) {
    parsed.coverageSummary = {
      conversationCount: 0,
      eligibleConversationCount: 0,
      messageCount: parsed.totalMessages,
      ownerMessageCount: parsed.userMessageCount,
      otherMessageCount: Math.max(0, parsed.totalMessages - parsed.userMessageCount),
      dateRangeStart: parsed.exportDateRange.earliest,
      dateRangeEnd: parsed.exportDateRange.latest,
      coverageQuality: parsed.isLowConfidence ? "low" : "medium",
      warnings: [],
    };
  }

  parsed.coverageSummary.dateRangeStart = new Date(parsed.coverageSummary.dateRangeStart);
  parsed.coverageSummary.dateRangeEnd = new Date(parsed.coverageSummary.dateRangeEnd);

  if (!parsed.conversationProfiles) {
    parsed.conversationProfiles = [];
  } else {
    parsed.conversationProfiles = parsed.conversationProfiles.map((profile) => ({
      ...profile,
      communicationStyle: {
        ...buildDefaultCommunicationStyleProfile(parsed),
        ...profile.communicationStyle,
      },
      attachmentPattern: {
        ...buildDefaultAttachmentPatternProfile(parsed),
        ...profile.attachmentPattern,
      },
    }));
  }

  if (!parsed.globalProfile) {
    parsed.globalProfile = {
      communicationStyle: buildDefaultCommunicationStyleProfile(parsed),
      attachmentPattern: buildDefaultAttachmentPatternProfile(parsed),
      stabilityMetrics: {
        responseConsistency: parsed.isLowConfidence ? "low" : "medium",
        relationshipStability: parsed.isLowConfidence ? "low" : "medium",
        coverageQuality: parsed.coverageSummary.coverageQuality,
      },
      coverage: parsed.coverageSummary,
      shareableSummaryCandidates: parsed.shareableSummary.map((summary) => ({
        summaryKey: summary.label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        summaryText: summary.value,
        sourceSignalKeys: [summary.label],
        confidence: summary.confidence,
        approvedForAgentSharing: true,
      })),
      privateOnlySignals: [],
    };
  } else {
    parsed.globalProfile.communicationStyle = {
      ...buildDefaultCommunicationStyleProfile(parsed),
      ...parsed.globalProfile.communicationStyle,
    };
    parsed.globalProfile.attachmentPattern = {
      ...buildDefaultAttachmentPatternProfile(parsed),
      ...parsed.globalProfile.attachmentPattern,
    };
    parsed.globalProfile.stabilityMetrics = {
      ...parsed.globalProfile.stabilityMetrics,
      responseConsistency:
        parsed.globalProfile.stabilityMetrics?.responseConsistency ??
        (parsed.isLowConfidence ? "low" : "medium"),
      relationshipStability:
        parsed.globalProfile.stabilityMetrics?.relationshipStability ??
        (parsed.isLowConfidence ? "low" : "medium"),
      coverageQuality:
        parsed.globalProfile.stabilityMetrics?.coverageQuality ??
        parsed.coverageSummary.coverageQuality,
    };
    parsed.globalProfile.coverage.dateRangeStart = new Date(parsed.globalProfile.coverage.dateRangeStart);
    parsed.globalProfile.coverage.dateRangeEnd = new Date(parsed.globalProfile.coverage.dateRangeEnd);
  }

  return parsed;
}

function buildDefaultCommunicationStyleProfile(
  signals: WhatsAppSignals,
): WhatsAppSignals["conversationProfiles"][number]["communicationStyle"] {
  return {
    derivedStyle: signals.derivedCommunicationStyle,
    responseLatencyProfile: {
      medianMinutesToReply: Math.round(signals.avgResponseLatencyMs / 60_000),
      p90MinutesToReply: Math.round((signals.avgResponseLatencyMs + signals.responseLatencyStdDevMs) / 60_000),
      weekdayVsWeekendShift: 0,
      dayVsNightShift: 0,
      consistency: signals.isLowConfidence ? "low" : "medium",
      confidence: signals.isLowConfidence ? "low" : "medium",
    },
    initiationProfile: {
      ownerInitiationRatio: signals.initiationRatio,
      conversationRestartRatio: signals.initiationRatio,
      followThroughRatio: signals.initiationRatio,
      confidence: signals.isLowConfidence ? "low" : "medium",
    },
    messageDepthProfile: {
      averageOwnerMessageLength: signals.avgMessageLength,
      averageOtherMessageLength: signals.avgMessageLength,
      longMessageRatio: signals.longMessageRatio,
      questionAskingRatio: signals.questionRatio,
      threadDepthIndex: 0,
      confidence: signals.isLowConfidence ? "low" : "medium",
    },
    mirroringProfile: {
      tempoMirroring: 0,
      lengthMirroring: 0,
      emojiMirroring: 0,
      punctuationMirroring: 0,
      confidence: signals.isLowConfidence ? "low" : "medium",
    },
    conflictStyleProfile: {
      repairAfterTensionIndex: 0,
      escalationTendency: 0,
      avoidanceTendency: 0,
      directnessAfterConflict: 0,
      confidence: signals.isLowConfidence ? "low" : "medium",
      sensitivityClass: "private-only",
    },
    expressivenessProfile: {
      emojiDensity: signals.emojiDensity,
      punctuationIntensity: 0,
      emotionalVocabularyRange: 0,
      humorSignalStrength: 0,
      confidence: signals.isLowConfidence ? "low" : "medium",
    },
  };
}

function buildDefaultAttachmentPatternProfile(
  signals: WhatsAppSignals,
): WhatsAppSignals["conversationProfiles"][number]["attachmentPattern"] {
  return {
    consistencyProfile: {
      responseConsistency: signals.isLowConfidence ? "low" : "medium",
      initiationConsistency: signals.isLowConfidence ? "low" : "medium",
      emotionalConsistency: signals.isLowConfidence ? "low" : "medium",
      confidence: signals.isLowConfidence ? "low" : "medium",
    },
    relationshipStabilityProfile: {
      closeTieStabilityScore: signals.closeTieStabilityScore,
      activeDaysPerWeek: 0,
      conversationLongevityDays: 0,
      confidence: signals.isLowConfidence ? "low" : "medium",
    },
    reengagementProfile: {
      restartAfterGapRatio: signals.initiationRatio,
      ownerReengagementShare: signals.initiationRatio,
      confidence: signals.isLowConfidence ? "low" : "medium",
    },
    closenessMaintenanceProfile: {
      questionAskingRatio: signals.questionRatio,
      followUpRatio: signals.questionRatio,
      acknowledgmentRatio: 0,
      confidence: signals.isLowConfidence ? "low" : "medium",
    },
  };
}

export function saveProfile(profile: RomanticProfile) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
}

export function loadProfile(): RomanticProfile | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(LOCAL_PROFILE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as RomanticProfile;
  } catch {
    return null;
  }
}

export function saveResult(result: MatchResult) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  localStorage.setItem(LOCAL_RESULT_KEY, JSON.stringify(result));
}

export function loadResult(): MatchResult | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(LOCAL_RESULT_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as MatchResult;
  } catch {
    return null;
  }
}

export function saveSignals(signals: WhatsAppSignals): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  localStorage.setItem(LOCAL_SIGNALS_KEY, JSON.stringify(signals));
}

export function loadSignals(): WhatsAppSignals | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(LOCAL_SIGNALS_KEY);
  if (!raw) return null;

  try {
    return reviveSignals(JSON.parse(raw) as WhatsAppSignals);
  } catch {
    return null;
  }
}

export function saveGap(gap: SelfAwarenessGap): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  localStorage.setItem(LOCAL_GAP_KEY, JSON.stringify(gap));
}

export function loadGap(): SelfAwarenessGap | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(LOCAL_GAP_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SelfAwarenessGap;
  } catch {
    return null;
  }
}

export async function loadProfileFromServer(profileId: string): Promise<RomanticProfile | null> {
  try {
    const response = await fetch(`/api/profiles?id=${encodeURIComponent(profileId)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const profile = (await response.json()) as RomanticProfile;
    saveProfile(profile);
    return profile;
  } catch {
    return null;
  }
}

export async function loadSignalsFromServer(profileId: string): Promise<WhatsAppSignals | null> {
  try {
    const response = await fetch(`/api/signals?profileId=${encodeURIComponent(profileId)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { signals: WhatsAppSignals };
    const signals = reviveSignals(payload.signals);
    saveSignals(signals);
    return signals;
  } catch {
    return null;
  }
}

export async function loadGapFromServer(profileId: string): Promise<SelfAwarenessGap | null> {
  try {
    const response = await fetch(`/api/gaps?profileId=${encodeURIComponent(profileId)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { gap: SelfAwarenessGap };
    saveGap(payload.gap);
    return payload.gap;
  } catch {
    return null;
  }
}

export async function loadResultFromServer(resultId: string): Promise<MatchResult | null> {
  try {
    const response = await fetch(`/api/matches/${encodeURIComponent(resultId)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const result = (await response.json()) as MatchResult;
    saveResult(result);
    return result;
  } catch {
    return null;
  }
}

// Server sync helpers — best-effort, never throw
export async function syncProfileToServer(profile: RomanticProfile): Promise<void> {
  try {
    await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
  } catch {
    // offline or deploy not yet configured — silently skip
  }
}

export async function syncSignalsToServer(
  profileId: string,
  signals: WhatsAppSignals,
  fileCount: number,
): Promise<void> {
  try {
    await fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, signals, fileCount }),
    });
  } catch {
    // silently skip
  }
}

export async function syncGapToServer(
  profileId: string,
  gap: SelfAwarenessGap,
): Promise<void> {
  try {
    await fetch("/api/gaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, gap }),
    });
  } catch {
    // silently skip
  }
}

export async function syncResultToServer(result: MatchResult): Promise<string | null> {
  try {
    const response = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { id?: string };
    return payload.id ?? null;
  } catch {
    // silently skip
    return null;
  }
}
