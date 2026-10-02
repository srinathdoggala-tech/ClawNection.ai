export interface VoicePersona {
  profile_id: string;
  vapi_call_id: string | null;
  portrait: string;
  structured_signals: string;
  voice_samples: string;
  transcript: string | null;
  recording_url: string | null;
  call_duration_seconds: number | null;
  ended_reason: string | null;
  analysis_skipped: boolean;
  created_at: string;
  updated_at: string;
}
