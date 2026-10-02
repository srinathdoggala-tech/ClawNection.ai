import { RomanticProfile } from "@/lib/types/matching";
import { SelfAwarenessGap, WhatsAppSignals } from "@/lib/types/behavioral";

export type EnrichmentResult = {
  updatedProfile: RomanticProfile;
  selfAwarenessGap: SelfAwarenessGap;
  changedFields: Array<"communicationStyle" | "sleepSchedule">;
};

export function enrichProfileFromSignals(
  profile: RomanticProfile,
  signals: WhatsAppSignals,
): EnrichmentResult {
  const updatedProfile: RomanticProfile = {
    ...profile,
    lifestyleHabits: { ...profile.lifestyleHabits },
  };

  const changedFields: EnrichmentResult["changedFields"] = [];

  if (!signals.isLowConfidence) {
    if (signals.derivedCommunicationStyle !== profile.communicationStyle) {
      updatedProfile.communicationStyle = signals.derivedCommunicationStyle;
      changedFields.push("communicationStyle");
    }

    if (signals.activeHoursProfile !== profile.lifestyleHabits.sleepSchedule) {
      updatedProfile.lifestyleHabits.sleepSchedule = signals.activeHoursProfile;
      changedFields.push("sleepSchedule");
    }
  }

  const selfAwarenessGap: SelfAwarenessGap = {
    statedCommunicationStyle: profile.communicationStyle,
    derivedCommunicationStyle: signals.derivedCommunicationStyle,
    statedSleepSchedule: profile.lifestyleHabits.sleepSchedule,
    derivedSleepSchedule: signals.activeHoursProfile,
    communicationStyleMatch: profile.communicationStyle === signals.derivedCommunicationStyle,
    sleepScheduleMatch: profile.lifestyleHabits.sleepSchedule === signals.activeHoursProfile,
    gapScore:
      [
        profile.communicationStyle !== signals.derivedCommunicationStyle,
        profile.lifestyleHabits.sleepSchedule !== signals.activeHoursProfile,
      ].filter(Boolean).length / 2,
  };

  return { updatedProfile, selfAwarenessGap, changedFields };
}
