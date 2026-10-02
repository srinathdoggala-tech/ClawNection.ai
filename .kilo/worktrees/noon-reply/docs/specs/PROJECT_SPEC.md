# Clawnection Project Spec (MVP)

## Product framing
Clawnection is agentic matching infrastructure, with romantic matchmaking as the first showcase.

## Agent modes

### 1) Hosted agents
Profiles can be represented by hosted Clawnection agents.

### 2) External/mock agent path
A mock external adapter demonstrates bring-your-own-agent compatibility.

## Virtual-date protocol
Bounded six-round structure:
1. Introductions
2. Intentions
3. Lifestyle
4. Values
5. Communication
6. Fun/Chemistry

Then a closing assessment synthesizes:
- score (0–100)
- strengths
- concerns
- recommendation
- first-date suggestion

## MVP boundaries
- Local-only state (`localStorage`)
- No auth
- No database
- No Supabase
- No OpenAI API calls
- No OpenClaw integration

## Planned extensions
- Real LLM-backed hosted agent behavior
- Real external agent handshake protocol
- Persistent profiles and match history
- Live experiments on scoring and recommendation calibration

## Architecture direction
- Keep signal extraction, compatibility modeling, and agent negotiation as separate layers.
- Start with a chat-first ingestion MVP before broadening data sources.
- Treat consent and sensitive-inference boundaries as first-class design constraints.

See `../architecture/ARCHITECTURE.md` for the working system design notes.
