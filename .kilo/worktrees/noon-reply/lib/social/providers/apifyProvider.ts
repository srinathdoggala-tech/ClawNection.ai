import {
  SocialResearch,
  SocialResearchProvider,
  SocialSource,
  SocialSourcePlatform,
} from "../types";
import { PublicPageProvider } from "./publicPageProvider";

export class ApifyProvider implements SocialResearchProvider {
  readonly name = "ApifyProvider";
  private fallbackProvider = new PublicPageProvider();
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || (typeof process !== "undefined" ? process.env.APIFY_API_KEY : undefined);
  }

  async fetchProfileData(
    url: string,
    platform: SocialSourcePlatform,
  ): Promise<SocialSource> {
    if (!this.apiKey) {
      // Graceful fallback to PublicPageProvider when no Apify API key is configured
      return this.fallbackProvider.fetchProfileData(url, platform);
    }

    try {
      // In production with an Apify token, call Apify actors (e.g. apify/instagram-scraper or linkedin-scraper)
      // Here we provide the standard integration call:
      const actorId =
        platform === "linkedin"
          ? "curious_coder/linkedin-profile-scraper"
          : "apify/instagram-profile-scraper";

      const runRes = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            platform === "linkedin"
              ? { urls: [url] }
              : { usernames: [url.split("/").filter(Boolean).pop()] },
          ),
        },
      );

      if (runRes.ok) {
        const items = (await runRes.json()) as Array<Record<string, unknown>>;
        const first = items[0];
        if (first) {
          return {
            platform,
            url,
            fetchedAt: new Date().toISOString(),
            title: (first.fullName || first.name || first.username) as string,
            description: (first.headline || first.biography || first.summary) as string,
            avatarUrl: (first.profilePicUrl || first.profilePicture) as string,
            text: JSON.stringify(first),
          };
        }
      }
    } catch {
      // Fallback on timeout or API error
    }

    return this.fallbackProvider.fetchProfileData(url, platform);
  }

  async synthesizeResearch(
    linkedin: SocialSource,
    instagram: SocialSource,
  ): Promise<SocialResearch> {
    return this.fallbackProvider.synthesizeResearch(linkedin, instagram);
  }
}
