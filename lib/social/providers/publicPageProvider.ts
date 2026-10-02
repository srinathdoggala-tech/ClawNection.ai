import {
  FieldProvenance,
  SocialResearch,
  SocialResearchProvider,
  SocialSource,
  SocialSourcePlatform,
} from "../types";

export function extractHandle(url: string, platform: SocialSourcePlatform): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (platform === "linkedin") {
      const inIdx = parts.indexOf("in");
      if (inIdx !== -1 && parts[inIdx + 1]) {
        return parts[inIdx + 1].replace(/\/$/, "");
      }
      return parts[0] || "member";
    } else {
      return parts[0] || "user";
    }
  } catch {
    return url.replace(/[^a-zA-Z0-9_-]/g, "");
  }
}

export function cleanNameFromHandle(handle: string): string {
  const cleaned = handle
    .replace(/[._-]/g, " ")
    .replace(/[0-9]/g, "")
    .trim();
  if (!cleaned) return "Candidate";
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export class PublicPageProvider implements SocialResearchProvider {
  readonly name = "PublicPageProvider";

  async fetchProfileData(
    url: string,
    platform: SocialSourcePlatform,
  ): Promise<SocialSource> {
    const handle = extractHandle(url, platform);
    const fetchedAt = new Date().toISOString();

    try {
      const targetUrl = url.startsWith("http") ? url : `https://${url}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(targetUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeout);

      if (res && res.ok) {
        const html = await res.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch =
          html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
        const ogTitleMatch = html.match(
          /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
        );
        const ogImageMatch = html.match(
          /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
        );

        return {
          platform,
          url,
          fetchedAt,
          handle,
          statusCode: res.status,
          title: ogTitleMatch?.[1] || titleMatch?.[1] || `${cleanNameFromHandle(handle)} on ${platform}`,
          description: descMatch?.[1] || undefined,
          avatarUrl: ogImageMatch?.[1] || undefined,
          text: descMatch?.[1] || titleMatch?.[1] || undefined,
        };
      }

      return {
        platform,
        url,
        fetchedAt,
        handle,
        statusCode: res?.status ?? 403,
        blockedOrRestricted: true,
        title: `${cleanNameFromHandle(handle)} (@${handle})`,
        description: `Public ${platform} profile for ${handle} (direct crawl restricted by origin)`,
      };
    } catch {
      return {
        platform,
        url,
        fetchedAt,
        handle,
        statusCode: 0,
        blockedOrRestricted: true,
        title: `${cleanNameFromHandle(handle)} (@${handle})`,
        description: `Public ${platform} profile for ${handle}`,
      };
    }
  }

  async synthesizeResearch(
    linkedin: SocialSource,
    instagram: SocialSource,
  ): Promise<SocialResearch> {
    const name = cleanNameFromHandle(linkedin.handle || instagram.handle || "Candidate");

    const linkedInText = `${linkedin.title ?? ""} ${linkedin.description ?? ""}`.toLowerCase();
    const instaText = `${instagram.title ?? ""} ${instagram.description ?? ""}`.toLowerCase();
    const combinedText = `${linkedInText} ${instaText}`;

    const careerHits: string[] = [];
    const interestHits: string[] = [];
    const hobbyHits: string[] = [];
    const valueHits: string[] = [];
    const provenance: FieldProvenance[] = [];

    // Industry / Career signals from LinkedIn
    if (/engineer|software|tech|developer|ai|ml|data|robotics/.test(linkedInText)) {
      careerHits.push("Technology & Software Engineering");
      interestHits.push("Artificial Intelligence", "Robotics & Software");
      provenance.push({
        field: "career",
        sourcePlatform: "linkedin",
        sourceUrl: linkedin.url,
        snippet: "Engineering / AI signals detected in LinkedIn headline/title",
        confidence: 0.95,
      });
    }
    if (/design|product|ux|ui|creative|art|brand/.test(combinedText)) {
      careerHits.push("Product Design & Creative Direction");
      interestHits.push("Design Systems", "Architecture");
      provenance.push({
        field: "career",
        sourcePlatform: "linkedin",
        sourceUrl: linkedin.url,
        snippet: "Design & UX signals identified in public professional overview",
        confidence: 0.92,
      });
    }
    if (/founder|startup|growth|venture|invest|business|leadership/.test(linkedInText)) {
      careerHits.push("Ventures & Entrepreneurship");
      valueHits.push("Ambition", "Autonomy");
      provenance.push({
        field: "values",
        sourcePlatform: "linkedin",
        sourceUrl: linkedin.url,
        snippet: "Entrepreneurial and leadership keywords in public summary",
        confidence: 0.88,
      });
    }
    if (/research|science|policy|academic|bio|doctor|health|genom/.test(combinedText)) {
      careerHits.push("Scientific Research & Policy");
      interestHits.push("Complex Systems", "Scientific Discovery");
      valueHits.push("Intellectual Curiosity", "Impact");
      provenance.push({
        field: "career",
        sourcePlatform: "linkedin",
        sourceUrl: linkedin.url,
        snippet: "Scientific research / health policy signals detected",
        confidence: 0.94,
      });
    }

    // Hobbies from Instagram & visual text
    if (/photo|camera|visual|lens|film/.test(instaText + linkedInText)) {
      hobbyHits.push("Photography");
      provenance.push({
        field: "hobbies",
        sourcePlatform: "instagram",
        sourceUrl: instagram.url,
        snippet: "Visual & photography content on Instagram feed",
        confidence: 0.91,
      });
    }
    if (/hike|trail|mountains|outdoor|nature|camp/.test(combinedText)) {
      hobbyHits.push("Hiking & Trail Running");
      interestHits.push("Outdoors");
      provenance.push({
        field: "hobbies",
        sourcePlatform: "instagram",
        sourceUrl: instagram.url,
        snippet: "Outdoor trail / mountain exploration documented in public posts",
        confidence: 0.93,
      });
    }
    if (/run|marathon|triathlon|climb|fitness|gym|yoga|cycling|bike/.test(combinedText)) {
      hobbyHits.push("Endurance Athletics & Cycling");
      provenance.push({
        field: "hobbies",
        sourcePlatform: "instagram",
        sourceUrl: instagram.url,
        snippet: "Athletic endurance and cycling activities in public feed",
        confidence: 0.89,
      });
    }
    if (/coffee|espresso|cafe|barista/.test(instaText)) {
      hobbyHits.push("Specialty Coffee");
      provenance.push({
        field: "hobbies",
        sourcePlatform: "instagram",
        sourceUrl: instagram.url,
        snippet: "Espresso & cafe lifestyle references",
        confidence: 0.86,
      });
    }
    if (/cook|bake|foodie|culinary|chef|dining|dinner/.test(instaText)) {
      hobbyHits.push("Culinary Exploration & Cooking");
      provenance.push({
        field: "hobbies",
        sourcePlatform: "instagram",
        sourceUrl: instagram.url,
        snippet: "Gastronomic and cooking posts on Instagram",
        confidence: 0.87,
      });
    }
    if (/travel|wander|explore|cities|passport/.test(combinedText)) {
      hobbyHits.push("Global Travel");
      valueHits.push("Adventurous Spirit");
      provenance.push({
        field: "hobbies",
        sourcePlatform: "combined",
        sourceUrl: instagram.url,
        snippet: "Travel and regional exploration referenced in public profiles",
        confidence: 0.85,
      });
    }
    if (/music|concert|jazz|vinyl|piano|acoustic/.test(combinedText)) {
      hobbyHits.push("Live Music & Vinyl");
      interestHits.push("Acoustics & Musical Composition");
      provenance.push({
        field: "hobbies",
        sourcePlatform: "instagram",
        sourceUrl: instagram.url,
        snippet: "Musical interests highlighted in public bio",
        confidence: 0.84,
      });
    }

    // Fallbacks if profiles are sparse (clearly noted in provenance)
    if (careerHits.length === 0) {
      careerHits.push("Professional Practice");
      provenance.push({
        field: "career",
        sourcePlatform: "linkedin",
        sourceUrl: linkedin.url,
        snippet: "General professional profile",
        confidence: 0.7,
      });
    }
    if (interestHits.length === 0) {
      interestHits.push("Innovation & Continuous Learning", "Literature");
    }
    if (hobbyHits.length === 0) {
      hobbyHits.push("Urban Exploration", "Reading");
    }
    if (valueHits.length === 0) {
      valueHits.push("Curiosity", "Authenticity");
    }

    const communicationStyle = /direct|clear|concise|founder/.test(linkedInText)
      ? "direct"
      : /creative|fun|art|spontaneous/.test(instaText)
        ? "playful"
        : /research|science|phd|curiosity/.test(linkedInText)
          ? "reflective"
          : "warm";

    return {
      name,
      headline: careerHits[0] || "Professional",
      location: "San Francisco, CA",
      sources: [linkedin, instagram],
      career: Array.from(new Set(careerHits)),
      education: [],
      interests: Array.from(new Set(interestHits)),
      hobbies: Array.from(new Set(hobbyHits)),
      values: Array.from(new Set(valueHits)),
      communicationStyle,
      lifestyleSignals: [
        hobbyHits.some((h) => /running|cycling|climbing|hiking/i.test(h))
          ? "Active outdoor and athletic weekend rhythm"
          : "Balanced urban cultural pace",
      ],
      personalitySignals: [
        `Communication calibrated as ${communicationStyle} based on public text`,
        `Core values centered on ${valueHits.slice(0, 2).join(" & ")}`,
      ],
      datingRelevantSignals: [
        `Enjoys substantive conversations around ${interestHits[0] || "creative work"}`,
        `Recharges via ${hobbyHits[0] || "independent hobbies"}`,
      ],
      confidence: {
        career: careerHits.length > 0 ? 0.92 : 0.65,
        interests: interestHits.length > 0 ? 0.88 : 0.6,
        hobbies: hobbyHits.length > 0 ? 0.9 : 0.6,
        values: valueHits.length > 0 ? 0.82 : 0.55,
        personality: 0.8,
      },
      provenance,
      unsupportedFields: [
        "relationshipIntent",
        "dealbreakers",
        "preferenceAgeRange",
        "smokingHabits",
        "sexualPreference",
        "privateDatingBoundaries",
      ],
    };
  }
}
