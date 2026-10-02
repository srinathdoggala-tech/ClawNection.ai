# Voice Onboarding Integration

This page integrates Vapi for voice-based user onboarding in the Clawnection app.

## Features

- **Pre-call Data Collection**: Users provide name, gender, and sexual preference before starting the voice call
- **30-Minute Call Limits**: Automatic call termination after 30 minutes to prevent excessive usage
- **Dynamic Assistant Configuration**: The voice agent receives pre-call data for personalized conversation
- **Secure API Key Management**: Keys stored in environment variables, never committed to git

## Setup Instructions

1. **Install Vapi SDK** (already done):

   ```bash
   npm install @vapi-ai/web
   ```

2. **Get Vapi API Key**:
   - Sign up at [Vapi.ai](https://vapi.ai)
   - Create an API key in your dashboard

3. **Get Vapi Assistant ID**:
   - Create or configure your assistant in Vapi
   - Copy the Assistant ID (format: `asst_xxxxxxxxx` or UUID)

4. **Set Environment Variables**:

   Copy `.env.example` to `.env.local` in the project root:

   ```bash
   cp .env.example .env.local
   ```

   Then set:

   ```bash
   NEXT_PUBLIC_VAPI_API_KEY=your_vapi_api_key_here
   NEXT_PUBLIC_VAPI_ASSISTANT_ID=your_vapi_assistant_id_here
   ```

5. **Restart the development server**:

   ```bash
   npm run dev
   ```

## How It Works

1. **Pre-call Form**: Users fill out name, gender, and sexual preference
2. **Assistant Update**: System dynamically updates the assistant's first message with user data
3. **Voice Call**: 30-minute conversation with personalized AI assistant
4. **Profile Creation**: Assistant collects comprehensive profile information
5. **Auto-termination**: Call ends automatically after 30 minutes

## Security Notes

- API keys are stored in `.env.local` (gitignored)
- No sensitive data is committed to the repository
- All authentication happens server-side or via environment variables

## Current Status

- ✅ **Pre-call form implemented**
- ✅ **30-minute timeout added**
- ✅ **Dynamic assistant configuration**
- ✅ **Security measures in place**
- ⚠️ **Web SDK authentication may need additional configuration**

## Next Steps

1. Test the complete voice onboarding flow
2. Deploy to production environment for full testing
3. Monitor call quality and duration
4. Consider additional security measures if needed

- ⚠️ Requires API keys to function
- ⚠️ Data extraction uses simple JSON parsing (could be improved with better NLP)
