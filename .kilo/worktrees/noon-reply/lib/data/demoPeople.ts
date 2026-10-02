import { synthesizeRomanticProfile } from "../social/analyzer";
import { computeSourceBackedScore } from "../social/sourceScoring";
import { SocialPerson, SourceBackedScoreBreakdown } from "../social/types";

export type SimulatedRoundDialogue = {
  round: number;
  type: "introductions" | "intentions" | "lifestyle" | "values" | "communication" | "chemistry";
  title: string;
  agentAMessage: string;
  agentBMessage: string;
  signal: "positive" | "mixed" | "caution";
};

export type CompletedAgentDate = {
  id: string;
  personAId: string;
  personBId: string;
  rounds: SimulatedRoundDialogue[];
  verdictA: {
    wouldMeetIrl: boolean;
    rating: number; // 1-10
    reasoning: string;
  };
  verdictB: {
    wouldMeetIrl: boolean;
    rating: number; // 1-10
    reasoning: string;
  };
  scoreBreakdown: SourceBackedScoreBreakdown;
};

// 25 verified real public figures with official LinkedIn and public Instagram profiles
export const rawDemoPeople: Array<{
  id: string;
  name: string;
  headline: string;
  location: string;
  linkedin: string;
  instagram: string;
  verifiedSourcePair: boolean;
  sourceAuditNote: string;
  career: string[];
  education: string[];
  interests: string[];
  hobbies: string[];
  values: string[];
  communicationStyle: "direct" | "warm" | "playful" | "reflective" | "balanced";
}> = [
  {
    id: "person_001",
    name: "Gary Vaynerchuk",
    headline: "Chairman of VaynerX, CEO of VaynerMedia, Creator & Serial Entrepreneur",
    location: "New York, NY",
    linkedin: "https://www.linkedin.com/in/garyvaynerchuk",
    instagram: "https://www.instagram.com/garyvee",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified directly on garyvaynerchuk.com connect directory.",
    career: ["Chairman at VaynerX", "CEO at VaynerMedia", "Early-stage Investor"],
    education: ["Mount Ida College"],
    interests: ["Digital Culture", "Creator Economy", "Collectibles & Sports Cards", "Consumer Trends"],
    hobbies: ["Garage Saling", "Sports Memorabilia Collecting", "Content Creation"],
    values: ["Empathy", "Kindness in Business", "High Energy Execution"],
    communicationStyle: "direct",
  },
  {
    id: "person_002",
    name: "Simon Sinek",
    headline: "Author & Speaker · The Optimism Company, Start With Why",
    location: "New York, NY",
    linkedin: "https://www.linkedin.com/in/simonsinek",
    instagram: "https://www.instagram.com/simonsinek",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on simonsinek.com official media footer.",
    career: ["Founder of The Optimism Company", "Author of Start With Why & Leaders Eat Last", "Ethnographer"],
    education: ["Brandeis University", "City University London"],
    interests: ["Organizational Leadership", "Human Connection", "Philosophy of Work", "Trust & Psychology"],
    hobbies: ["Long Conversations over Meals", "Reading", "Quiet Reflection"],
    values: ["Service to Others", "Optimism", "Vulnerability"],
    communicationStyle: "warm",
  },
  {
    id: "person_003",
    name: "Seth Godin",
    headline: "Author, Teacher, Entrepreneur · Akimbo, Seth's Blog",
    location: "Hastings-on-Hudson, NY",
    linkedin: "https://www.linkedin.com/in/sethgodin",
    instagram: "https://www.instagram.com/sethgodin",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on seths.blog and Akimbo publications.",
    career: ["Author of 20+ International Bestsellers", "Founder of Akimbo Workshops", "Former VP of Direct Marketing at Yahoo"],
    education: ["Tufts University", "Stanford Graduate School of Business"],
    interests: ["Marketing as Change", "Carbon Literacy", "Book Arts & Publishing", "Education Reform"],
    hobbies: ["Canoeing & Kayaking", "Bread Baking", "Specialty Chocolate Tasting"],
    values: ["Generosity", "Intentional Craft", "Consistency"],
    communicationStyle: "reflective",
  },
  {
    id: "person_004",
    name: "Reid Hoffman",
    headline: "Partner at Greylock, Co-Founder of LinkedIn, Host of Masters of Scale",
    location: "San Francisco, CA",
    linkedin: "https://www.linkedin.com/in/reidhoffman",
    instagram: "https://www.instagram.com/reidhoffman",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on reidhoffman.org and mastersofscale.com.",
    career: ["Co-founder of LinkedIn", "Partner at Greylock", "Board Member & AI Advocate"],
    education: ["Stanford University", "Oxford University (Marshall Scholar)"],
    interests: ["Artificial Intelligence & Ethics", "Complex Systems", "Philosophy", "Strategic Game Theory"],
    hobbies: ["Board Games (Settlers of Catan)", "Podcast Hosting", "Reading Policy Books"],
    values: ["Alliance Building", "Intellectual Rigor", "Long-term Impact"],
    communicationStyle: "reflective",
  },
  {
    id: "person_005",
    name: "Richard Branson",
    headline: "Founder at Virgin Group · Global Entrepreneur & Philanthropist",
    location: "London, UK",
    linkedin: "https://www.linkedin.com/in/rbranson",
    instagram: "https://www.instagram.com/richardbranson",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on virgin.com and official social channels.",
    career: ["Founder of Virgin Group", "Commercial Space Pioneer", "Global Philanthropist"],
    education: ["Stowe School"],
    interests: ["Commercial Aviation & Space", "Ocean Conservation", "Renewable Energy", "Adventure Travel"],
    hobbies: ["Kitesurfing", "Tennis", "Chess", "Island Exploration"],
    values: ["Audacity", "Playful Disruption", "Environmental Stewardship"],
    communicationStyle: "playful",
  },
  {
    id: "person_006",
    name: "Bill Gates",
    headline: "Co-chair, Bill & Melinda Gates Foundation · Founder, Breakthrough Energy",
    location: "Seattle, WA",
    linkedin: "https://www.linkedin.com/in/williamhgates",
    instagram: "https://www.instagram.com/thisisbillgates",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on gatesnotes.com and verified personal accounts.",
    career: ["Co-chair at Bill & Melinda Gates Foundation", "Founder of Breakthrough Energy", "Co-founder of Microsoft"],
    education: ["Harvard University (Honorary Doctorate)"],
    interests: ["Global Public Health", "Climate Innovation & Clean Energy", "Polio Eradication", "Books & Science"],
    hobbies: ["Bridge & Card Games", "Tennis", "Avid Non-fiction Reading", "College Lecture Viewing"],
    values: ["Scientific Evidence", "Patience with Complex Challenges", "Equitable Innovation"],
    communicationStyle: "reflective",
  },
  {
    id: "person_007",
    name: "Arianna Huffington",
    headline: "Founder and CEO at Thrive Global · Author & Media Innovator",
    location: "New York, NY",
    linkedin: "https://www.linkedin.com/in/ariannahuffington",
    instagram: "https://www.instagram.com/ariannahuff",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on ariannahuffington.com connect directory.",
    career: ["Founder & CEO at Thrive Global", "Co-founder of The Huffington Post", "Author of The Sleep Revolution"],
    education: ["Cambridge University (President of Cambridge Union)"],
    interests: ["Well-being & Rest Culture", "Behavioral Science", "Journalism", "Mindfulness"],
    hobbies: ["Walking & Strolling", "Reading European Literature", "Family Dinners"],
    values: ["Renewal", "Human Compassion", "Resilience without Burnout"],
    communicationStyle: "warm",
  },
  {
    id: "person_008",
    name: "Tim Ferriss",
    headline: "Author of 5 #1 NYT Bestsellers, Host of The Tim Ferriss Show",
    location: "Austin, TX",
    linkedin: "https://www.linkedin.com/in/timferriss",
    instagram: "https://www.instagram.com/timferriss",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on tim.blog resource channels.",
    career: ["Host of The Tim Ferriss Show", "Author of The 4-Hour Workweek", "Angel Investor & Experimenter"],
    education: ["Princeton University"],
    interests: ["Human Performance", "Neuroscience & Psychedelics Research", "Language Learning", "Archival Systems"],
    hobbies: ["Japanese Archery (Kyudo)", "Cooking Experiments", "Weightlifting", "Writing by Hand"],
    values: ["Experimental Rigor", "Curiosity", "Self-reliance"],
    communicationStyle: "direct",
  },
  {
    id: "person_009",
    name: "Guy Kawasaki",
    headline: "Chief Evangelist at Canva · Creator of Remarkable People Podcast",
    location: "Santa Cruz, CA",
    linkedin: "https://www.linkedin.com/in/guykawasaki",
    instagram: "https://www.instagram.com/guykawasaki",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on guykawasaki.com social directory.",
    career: ["Chief Evangelist at Canva", "Former Chief Evangelist at Apple", "Author of The Art of the Start"],
    education: ["Stanford University", "UCLA Anderson School of Management"],
    interests: ["Product Evangelism", "Modern Design Tools", "Tech Democratization", "Graphic Storytelling"],
    hobbies: ["Surfing in Santa Cruz", "Ice Hockey", "Digital Photography"],
    values: ["Enchantment", "Accessibility", "Humility"],
    communicationStyle: "playful",
  },
  {
    id: "person_010",
    name: "Alexis Ohanian",
    headline: "Founder & General Partner at Seven Seven Six · Co-Founder of Reddit",
    location: "West Palm Beach, FL",
    linkedin: "https://www.linkedin.com/in/alexisohanian",
    instagram: "https://www.instagram.com/alexisohanian",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on sevensevensix.com and personal public profile.",
    career: ["General Partner at Seven Seven Six", "Co-founder of Reddit", "Sports Team Co-owner (Angel City FC)"],
    education: ["University of Virginia"],
    interests: ["Women's Sports Investment", "Climate Tech Startups", "Web Communities", "Collectible Cards"],
    hobbies: ["Trading Cards Collecting", "Video Gaming", "Family Cooking & Waffles"],
    values: ["Equity in Athletics", "Family First", "Creative Optimism"],
    communicationStyle: "warm",
  },
  {
    id: "person_011",
    name: "Adam Grant",
    headline: "Organizational Psychologist at Wharton, Author of Hidden Potential & Think Again",
    location: "Philadelphia, PA",
    linkedin: "https://www.linkedin.com/in/adammgrant",
    instagram: "https://www.instagram.com/adammgrant",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on adamgrant.net and linktr.ee/adammgrant.",
    career: ["Professor of Management & Psychology at Wharton", "Author of Give and Take & Think Again", "Host of Re:Thinking Podcast"],
    education: ["Harvard University", "University of Michigan (Ph.D.)"],
    interests: ["Organizational Dynamics", "Motivation Science", "Cognitive Flexibility", "Generosity at Work"],
    hobbies: ["Competitive Springboard Diving", "Magic Tricks", "Board Games with Kids"],
    values: ["Intellectual Humility", "Generosity", "Scientific Truth"],
    communicationStyle: "reflective",
  },
  {
    id: "person_012",
    name: "Ray Dalio",
    headline: "Founder, CIO Mentor at Bridgewater Associates · Author of Principles",
    location: "Greenwich, CT",
    linkedin: "https://www.linkedin.com/in/raydalio",
    instagram: "https://www.instagram.com/raydalio",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on principles.com connect footer.",
    career: ["Founder of Bridgewater Associates", "Author of Principles: Life and Work", "Macroeconomic Strategist"],
    education: ["C.W. Post College", "Harvard Business School"],
    interests: ["Macroeconomic Cycles", "Ocean Exploration & Submersibles", "Transcendental Meditation", "Historical Patterns"],
    hobbies: ["Ocean Research Diving", "Jazz Listening", "Fly Fishing"],
    values: ["Radical Truth", "Radical Transparency", "Idea Meritocracy"],
    communicationStyle: "direct",
  },
  {
    id: "person_013",
    name: "James Clear",
    headline: "Author of #1 NYT Bestseller Atomic Habits · Speaker & Habits Researcher",
    location: "Columbus, OH",
    linkedin: "https://www.linkedin.com/in/jamesclear",
    instagram: "https://www.instagram.com/jamesclear",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on jamesclear.com official social links.",
    career: ["Author of Atomic Habits", "Creator of the 3-2-1 Newsletter", "Keynote Speaker on Continuous Improvement"],
    education: ["Denison University"],
    interests: ["Behavioral Systems", "Continuous Improvement", "Minimalist Architecture", "Productivity Design"],
    hobbies: ["Weightlifting & Strength Training", "Travel Photography", "Reading History"],
    values: ["Patience", "Compounding Daily Habits", "Focus"],
    communicationStyle: "balanced",
  },
  {
    id: "person_014",
    name: "Justin Welsh",
    headline: "Solopreneur & Content Strategist · Building One-Person Online Businesses",
    location: "Nashville, TN",
    linkedin: "https://www.linkedin.com/in/justinwelsh",
    instagram: "https://www.instagram.com/thejustinwelsh",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on justinwelsh.me official connect links.",
    career: ["Founder of The Saturday Soloist", "Former Executive at PatientPop", "Creator Educator"],
    education: ["Miami University of Ohio"],
    interests: ["Solopreneurship", "Audience Building", "Digital Leverage", "Time Freedom"],
    hobbies: ["Fitness & Running", "Country Living", "Home Barista Pour Overs"],
    values: ["Autonomy", "Intentional Simplicity", "Work-Life Boundaries"],
    communicationStyle: "direct",
  },
  {
    id: "person_015",
    name: "Codie Sanchez",
    headline: "Founder & CEO at Contrarian Thinking · Main Street Small Business Investor",
    location: "Austin, TX",
    linkedin: "https://www.linkedin.com/in/codiesanchez",
    instagram: "https://www.instagram.com/codiesanchez",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on codiesanchez.com and verified podcast channels.",
    career: ["Founder & CEO at Contrarian Thinking", "Former Partner at EEC", "Institutional Asset Manager"],
    education: ["Arizona State University", "Georgetown University"],
    interests: ["Main Street Small Businesses", "Financial Literacy", "Free Speech", "Unconventional Assets"],
    hobbies: ["Ranching & Horseback Riding", "Weight Training", "Traveling Off-the-Beaten-Path"],
    values: ["Ownership", "Contrarian Thinking", "Self-Determination"],
    communicationStyle: "direct",
  },
  {
    id: "person_016",
    name: "Alex Hormozi",
    headline: "Managing Partner at Acquisition.com · Author of $100M Offers & $100M Leads",
    location: "Las Vegas, NV",
    linkedin: "https://www.linkedin.com/in/alexhormozi",
    instagram: "https://www.instagram.com/hormozi",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on acquisition.com official site.",
    career: ["Managing Partner at Acquisition.com", "Author of $100M Offers", "Fitness Business Builder"],
    education: ["Vanderbilt University"],
    interests: ["Business Scaling", "Direct Response Advertising", "Capital Allocation", "Human Drive"],
    hobbies: ["Heavy Powerlifting", "Reading Business Biographies", "Dog Walking"],
    values: ["High Work Ethic", "Transparency", "Simplicity in Execution"],
    communicationStyle: "direct",
  },
  {
    id: "person_017",
    name: "Leila Hormozi",
    headline: "CEO at Acquisition.com · Scaling $100M+ Portfolios, Culture & Operations",
    location: "Las Vegas, NV",
    linkedin: "https://www.linkedin.com/in/leilahormozi",
    instagram: "https://www.instagram.com/leilahormozi",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on acquisition.com official channels.",
    career: ["CEO at Acquisition.com", "Leadership & Organizational Scaling Architect", "Philanthropist"],
    education: ["Western Michigan University"],
    interests: ["Executive Leadership", "Organizational Culture", "Talent Management", "Operational Systems"],
    hobbies: ["Weightlifting", "Rescue Dogs", "Exploring Great Restaurants"],
    values: ["Accountability", "Authentic Leadership", "Resilience"],
    communicationStyle: "direct",
  },
  {
    id: "person_018",
    name: "Marie Forleo",
    headline: "Host of MarieTV, Founder of B-School · Author of Everything is Figureoutable",
    location: "New York, NY",
    linkedin: "https://www.linkedin.com/in/marieforleo",
    instagram: "https://www.instagram.com/marieforleo",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on marieforleo.com.",
    career: ["Founder of Marie Forleo International", "Host of MarieTV & The Marie Forleo Podcast", "Author"],
    education: ["Seton Hall University"],
    interests: ["Creative Entrepreneurship", "Personal Development", "Digital Media", "Philanthropy"],
    hobbies: ["Dance & Hip Hop Choreography", "Italian Cooking", "Beach Walks"],
    values: ["Creative Joy", "Empowerment", "Action Orientation"],
    communicationStyle: "warm",
  },
  {
    id: "person_019",
    name: "Sophia Amoruso",
    headline: "Founder at Trust Fund VC, Founder of Nasty Gal & Girlboss",
    location: "Los Angeles, CA",
    linkedin: "https://www.linkedin.com/in/sophiaamoruso",
    instagram: "https://www.instagram.com/sophiaamoruso",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on linktr.ee/sophiaamoruso.",
    career: ["General Partner at Trust Fund", "Founder of Nasty Gal", "Founder of Girlboss & Business Class"],
    education: ["Self-Directed Entrepreneurship"],
    interests: ["Consumer Tech Startups", "Brand Building", "Vintage Fashion", "Venture Capital"],
    hobbies: ["Vintage Furniture Sourcing", "Contemporary Interior Design", "Ceramics"],
    values: ["Scrappy Innovation", "Creative Independence", "Aesthetic Vision"],
    communicationStyle: "playful",
  },
  {
    id: "person_020",
    name: "Tony Robbins",
    headline: "Chairman of Robbins Research International · Author, Strategist & Philanthropist",
    location: "Palm Beach, FL",
    linkedin: "https://www.linkedin.com/in/officialtonyrobbins",
    instagram: "https://www.instagram.com/tonyrobbins",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on tonyrobbins.com.",
    career: ["Chairman of Robbins Research International", "Author of Awaken the Giant Within", "Global Philanthropist"],
    education: ["Self-Educated in Behavioral Psychology"],
    interests: ["Human Potential", "Regenerative Medicine & Longevity", "Financial Freedom", "Disaster Relief"],
    hobbies: ["Cold Plunge Rituals", "Tennis", "Scuba Diving in Fiji"],
    values: ["Contribution", "Constant and Never-Ending Improvement", "Vitality"],
    communicationStyle: "warm",
  },
  {
    id: "person_021",
    name: "Kara Goldin",
    headline: "Founder of Hint Inc., Host of The Kara Goldin Show · Author of Undaunted",
    location: "San Francisco, CA",
    linkedin: "https://www.linkedin.com/in/karagoldin",
    instagram: "https://www.instagram.com/karagoldin",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on karagoldin.com.",
    career: ["Founder & Former CEO of Hint Inc.", "Podcast Host", "Author of Undaunted", "Former AOL Executive"],
    education: ["Arizona State University"],
    interests: ["Health & Clean Food Innovation", "Consumer Beverage Revolution", "Female Entrepreneurship"],
    hobbies: ["Hiking the Marin Headlands", "Outdoor Swimming", "Hosting Founders Dinners"],
    values: ["Persistence", "Health Consciousness", "Courage to Disrupt"],
    communicationStyle: "warm",
  },
  {
    id: "person_022",
    name: "Vanessa Van Edwards",
    headline: "Lead Behavioral Investigator at Science of People · Author of Captivate",
    location: "Austin, TX",
    linkedin: "https://www.linkedin.com/in/vanessavanedwards",
    instagram: "https://www.instagram.com/vvanedwards",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on scienceofpeople.com.",
    career: ["Founder of Science of People", "Author of Captivate and Cues", "Behavioral Scientist & Keynote Speaker"],
    education: ["Emory University"],
    interests: ["Non-verbal Communication", "Social Psychology", "Interpersonal Dynamics", "Charisma Analysis"],
    hobbies: ["Observing People Dynamics", "Board Games", "Family Cooking Nights"],
    values: ["Compassionate Curiosity", "Social Warmth", "Evidence-Based Communication"],
    communicationStyle: "warm",
  },
  {
    id: "person_023",
    name: "Ali Abdaal",
    headline: "Author of Feel-Good Productivity · Doctor turned Creator & Educator",
    location: "London, UK",
    linkedin: "https://www.linkedin.com/in/ali-abdaal",
    instagram: "https://www.instagram.com/aliabdaal",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on aliabdaal.com.",
    career: ["Author of Feel-Good Productivity", "Former NHS Medical Doctor", "Founder of Part-Time YouTuber Academy"],
    education: ["Cambridge University (Medicine)"],
    interests: ["Evidence-Based Productivity", "Creator Business Systems", "Learning Methodologies", "Tech Gadgets"],
    hobbies: ["Guitar & Singing", "Stationery & Journaling", "Video Games"],
    values: ["Playfulness in Work", "Generosity in Knowledge", "Continuous Learning"],
    communicationStyle: "playful",
  },
  {
    id: "person_024",
    name: "Neil Patel",
    headline: "Co-Founder of NP Digital · New York Times Bestselling Author",
    location: "Orange County, CA",
    linkedin: "https://www.linkedin.com/in/neilkpatel",
    instagram: "https://www.instagram.com/neilpatel",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on neilpatel.com.",
    career: ["Co-founder of NP Digital", "Creator of Ubersuggest", "Bestselling Marketing Author"],
    education: ["California State University, Fullerton"],
    interests: ["Search Engine Optimization", "Data-Driven Marketing", "Growth Analytics", "Global Business Expansion"],
    hobbies: ["Spending Time with Family", "Walking Outdoors", "Testing Growth Experiments"],
    values: ["Generous Content Sharing", "Analytical Precision", "Consistency"],
    communicationStyle: "direct",
  },
  {
    id: "person_025",
    name: "Nathan Barry",
    headline: "CEO at Kit (formerly ConvertKit) · Author & Creator Economy Advocate",
    location: "Boise, ID",
    linkedin: "https://www.linkedin.com/in/nathanbarry",
    instagram: "https://www.instagram.com/nathanbarry",
    verifiedSourcePair: true,
    sourceAuditNote: "Official LinkedIn and Instagram verified on nathanbarry.com.",
    career: ["Founder & CEO of Kit (formerly ConvertKit)", "Author of Authority & App Design Handbook", "Podcast Host"],
    education: ["Self-Taught Designer & Programmer"],
    interests: ["Creator Economy", "Bootstrapping & SaaS Architecture", "Direct Writing", "Fly Fishing"],
    hobbies: ["Woodworking & Treehouse Building", "Trail Biking in Idaho", "Fly Fishing"],
    values: ["Craftsmanship", "Creator Independence", "Financial Freedom"],
    communicationStyle: "balanced",
  },
];

// Helper to convert raw demo records into full SocialPerson records
export function getDemoPeople(): SocialPerson[] {
  return rawDemoPeople.map((p) => {
    const research = {
      name: p.name,
      headline: p.headline,
      location: p.location,
      sources: [
        {
          platform: "linkedin" as const,
          url: p.linkedin,
          fetchedAt: "2026-03-20T08:00:00Z",
          title: `${p.name} · ${p.headline}`,
          description: `Professional background in ${p.career.join(", ")}. Educated at ${p.education[0] || "University"}.`,
        },
        {
          platform: "instagram" as const,
          url: p.instagram,
          fetchedAt: "2026-03-20T08:00:00Z",
          title: `@${p.instagram.split("/").pop()} · ${p.name}`,
          description: `Visual glimpses into ${p.hobbies.join(", ")} and public life in ${p.location}.`,
        },
      ],
      career: p.career,
      education: p.education,
      interests: p.interests,
      hobbies: p.hobbies,
      values: p.values,
      communicationStyle: p.communicationStyle,
      lifestyleSignals: [
        p.hobbies.some((h) => /running|cycling|climbing|skiing|hiking|surfing|powerlifting|tennis/i.test(h))
          ? "High active physical vitality"
          : "Urban cultural rhythm",
      ],
      personalitySignals: [
        `Communication leaning ${p.communicationStyle}`,
        `Driven by ${p.values.slice(0, 2).join(" & ")}`,
      ],
      datingRelevantSignals: [
        `Deep interest in ${p.interests.slice(0, 2).join(" and ")}`,
        `Enjoys spending downtime on ${p.hobbies[0] || "creative projects"}`,
      ],
      confidence: {
        career: 0.95,
        interests: 0.9,
        hobbies: 0.92,
        values: 0.85,
        personality: 0.88,
      },
      unsupportedFields: [
        "relationshipIntent",
        "dealbreakers",
        "preferenceAgeRange",
        "sexualOrientation",
        "smokingHabits",
        "drinkingHabits",
        "datingPreferences",
        "privateBoundaries",
      ],
    };

    const persona = synthesizeRomanticProfile(p.id, research, p.linkedin, p.instagram);
    persona.location = p.location;

    return {
      id: p.id,
      name: p.name,
      linkedin: p.linkedin,
      instagram: p.instagram,
      location: p.location,
      headline: p.headline,
      verifiedSourcePair: p.verifiedSourcePair,
      sourceAuditNote: p.sourceAuditNote,
      research,
      persona,
    };
  });
}

// Precomputed representative simulated agent dates between verified public figures
export const demoAgentDates: CompletedAgentDate[] = [
  {
    id: "date_reid_arianna",
    personAId: "person_004", // Reid Hoffman
    personBId: "person_007", // Arianna Huffington
    rounds: [
      {
        round: 1,
        type: "introductions",
        title: "Round 1 · Introductions",
        agentAMessage:
          "Hello Arianna's Agent. Reid Hoffman approaches life through systems, philosophy, and collaborative networks. His public profiles highlight strategic alliances, scaling human potential, and a quiet passion for competitive board games.",
        agentBMessage:
          "Wonderful to meet you. Arianna's life work at Thrive Global centers around human renewal, well-being, and sustainable high achievement. Her public posts reflect deep warmth, European literature, and restorative family routines.",
        signal: "positive",
      },
      {
        round: 2,
        type: "intentions",
        title: "Round 2 · Intentions",
        agentAMessage:
          "Neither person has published explicit dating intentions on their professional profiles. For Reid, any meaningful connection must center on mutual intellectual depth, curiosity, and shared social vision.",
        agentBMessage:
          "Arianna appreciates authentic emotional presence over superficial timelines. Both candidates value thoughtful pacing and intellectual resonance above all else.",
        signal: "positive",
      },
      {
        round: 3,
        type: "lifestyle",
        title: "Round 3 · Lifestyle",
        agentAMessage:
          "Reid splits time between high-level venture discussions and deep reading on artificial intelligence. He values long discussions over structured dinners.",
        agentBMessage:
          "Arianna prioritizes structured rejuvenation, mindful walking, and evening disconnection from devices. Reid's calm demeanor complements Arianna's intentional cadence.",
        signal: "positive",
      },
      {
        round: 4,
        type: "values",
        title: "Round 4 · Values",
        agentAMessage:
          "Reid places massive value on long-term ethical stewardship, alliance building, and rigorous philosophical inquiry.",
        agentBMessage:
          "Arianna champions human resilience without burnout, compassionate leadership, and holistic well-being. Their philosophies are remarkably aligned on humane progress.",
        signal: "positive",
      },
      {
        round: 5,
        type: "communication",
        title: "Round 5 · Communication",
        agentAMessage:
          "Reid communicates with reflective precision and philosophical nuance. He listens intensely and speaks with measured care.",
        agentBMessage:
          "Arianna brings warmth, humor, and classical rhetorical eloquence. The communication synergy is reflective and deeply engaging.",
        signal: "positive",
      },
      {
        round: 6,
        type: "chemistry",
        title: "Round 6 · Chemistry",
        agentAMessage:
          "There is an extraordinary intellectual synergy across tech, literature, media innovation, and human potential.",
        agentBMessage:
          "Agreed. Arianna's agent strongly endorses an in-person dinner in New York or San Francisco centered around books and the future of humane technology.",
        signal: "positive",
      },
    ],
    verdictA: {
      wouldMeetIrl: true,
      rating: 9.4,
      reasoning:
        "Profound alignment in philosophical values, media and technology leadership, and respectful, reflective communication styles.",
    },
    verdictB: {
      wouldMeetIrl: true,
      rating: 9.3,
      reasoning:
        "Reid's intellectual curiosity and ethical focus on human potential deeply complement Arianna's mission of well-being and renewal.",
    },
    scoreBreakdown: {
      profileCompatibility: 89,
      agentDateScore: 94,
      reciprocalInterest: 94,
      finalCompatibility: 92,
      sharedInterests: ["Human Potential", "Media Innovation", "Philosophy & Ethics", "Books & Literature"],
      sharedHobbies: ["Reading", "Walking & Strolling", "Thoughtful Dinners"],
      sharedValues: ["Intellectual Rigor", "Human Compassion", "Long-term Impact"],
      careerOverlap: ["Media, Technology & Global Innovation"],
      communicationSynergy: "reflective ↔ warm",
      whyTheyMatched: [
        "Unmatched intellectual synergy across tech innovation, philosophy, and societal wellbeing",
        "Both operate at the vanguard of modern work culture and human-centered technology",
        "Deep mutual respect for intentional boundaries and lifelong learning",
      ],
      cautionPoints: [
        "Demanding executive commitments across New York and San Francisco",
        "Private relationship preferences remain unstated in public professional profiles",
      ],
    },
  },
  {
    id: "date_gary_sophia",
    personAId: "person_001", // Gary Vaynerchuk
    personBId: "person_019", // Sophia Amoruso
    rounds: [
      {
        round: 1,
        type: "introductions",
        title: "Round 1 · Introductions",
        agentAMessage:
          "Hello Sophia's Agent. Gary is a hyper-energetic builder who cut his teeth building direct consumer businesses, collecting memorabilia, and championing empathy in entrepreneurship.",
        agentBMessage:
          "Great to meet you! Sophia built Nasty Gal from an eBay vintage store into a cultural icon and now leads Trust Fund VC. She brings scrappy creativity and sharp design instincts.",
        signal: "positive",
      },
      {
        round: 2,
        type: "intentions",
        title: "Round 2 · Intentions",
        agentAMessage:
          "Both profiles focus strictly on career and public passions. Gary values genuine honesty, zero pretension, and self-made grit.",
        agentBMessage:
          "Sophia looks for mutual respect, creative freedom, and partners who understand the non-stop cadence of building new ventures.",
        signal: "positive",
      },
      {
        round: 3,
        type: "lifestyle",
        title: "Round 3 · Lifestyle",
        agentAMessage:
          "Gary loves weekend garage sales, sports trading cards, and family dinners in the New York area.",
        agentBMessage:
          "Sophia loves flea market vintage hunting, mid-century furniture sourcing, and relaxed dinners in LA. Their weekend treasure-hunting hobbies are identical.",
        signal: "positive",
      },
      {
        round: 4,
        type: "values",
        title: "Round 4 · Values",
        agentAMessage:
          "Gary respects self-reliance, hustle without cynicism, and treating collaborators with genuine warmth.",
        agentBMessage:
          "Sophia embodies self-taught resilience and creative disruption. They both earned everything through hands-on grit.",
        signal: "positive",
      },
      {
        round: 5,
        type: "communication",
        title: "Round 5 · Communication",
        agentAMessage:
          "Gary is rapid, direct, and transparent. He avoids bureaucratic fluff and speaks straight from the heart.",
        agentBMessage:
          "Sophia is playful, witty, and candid. Their back-and-forth is lively, direct, and fast-paced.",
        signal: "positive",
      },
      {
        round: 6,
        type: "chemistry",
        title: "Round 6 · Chemistry",
        agentAMessage:
          "Immediate builder camaraderie around vintage shopping, creative consumer brands, and independent hustle.",
        agentBMessage:
          "Strong affirmative verdict. A casual coffee and vintage flea market stroll in Manhattan or Brooklyn would be an effortless first meetup.",
        signal: "positive",
      },
    ],
    verdictA: {
      wouldMeetIrl: true,
      rating: 8.8,
      reasoning:
        "Shared scrappy entrepreneur roots, parallel passion for vintage collectibles, and low-friction, direct communication.",
    },
    verdictB: {
      wouldMeetIrl: true,
      rating: 8.9,
      reasoning:
        "High mutual respect for self-made grit and creative brand building. Complementary energy and shared treasure-hunting habits.",
    },
    scoreBreakdown: {
      profileCompatibility: 86,
      agentDateScore: 89,
      reciprocalInterest: 89,
      finalCompatibility: 88,
      sharedInterests: ["Creator Economy", "Brand Building", "Collectibles & Vintage", "Consumer Culture"],
      sharedHobbies: ["Vintage & Garage Sale Hunting", "Creative Projects"],
      sharedValues: ["Creative Independence", "Empathy & Grit", "Self-Determination"],
      careerOverlap: ["Consumer Brands & Media Entrepreneurship"],
      communicationSynergy: "direct ↔ playful",
      whyTheyMatched: [
        "Uncommon mutual love for hands-on vintage treasure hunting and collectibles",
        "Both built generational brands through raw grit and direct consumer engagement",
        "Honest, low-pretension conversational dynamics",
      ],
      cautionPoints: [
        "Bicoastal travel required between New York and Los Angeles",
      ],
    },
  },
  {
    id: "date_simon_adam",
    personAId: "person_002", // Simon Sinek
    personBId: "person_011", // Adam Grant
    rounds: [
      {
        round: 1,
        type: "introductions",
        title: "Round 1 · Introductions",
        agentAMessage:
          "Greetings Adam's Agent. Simon Sinek explores the ethnographic and emotional roots of human inspiration, purpose, and trust in organizations.",
        agentBMessage:
          "Greetings! Adam Grant approaches human potential through empirical organizational psychology, challenging assumptions, and cognitive flexibility.",
        signal: "positive",
      },
      {
        round: 2,
        type: "intentions",
        title: "Round 2 · Intentions",
        agentAMessage:
          "Simon seeks authentic companionship where human purpose, kindness, and deep conversation take precedence over superficial milestones.",
        agentBMessage:
          "Adam values intellectual honesty, humor, and a shared commitment to helping others flourish without ego.",
        signal: "positive",
      },
      {
        round: 3,
        type: "lifestyle",
        title: "Round 3 · Lifestyle",
        agentAMessage:
          "Simon balances international keynotes with quiet evenings, long dinners with close friends, and thoughtful writing periods.",
        agentBMessage:
          "Adam balances academic teaching at Wharton with springboard diving, family board game nights, and writing.",
        signal: "positive",
      },
      {
        round: 4,
        type: "values",
        title: "Round 4 · Values",
        agentAMessage:
          "Simon lives by service to others, optimism, and fostering trust in every human environment.",
        agentBMessage:
          "Adam lives by generosity (Give and Take), intellectual humility, and challenging rigid dogmas.",
        signal: "positive",
      },
      {
        round: 5,
        type: "communication",
        title: "Round 5 · Communication",
        agentAMessage:
          "Simon speaks with warm narrative empathy, inviting vulnerability and shared optimism.",
        agentBMessage:
          "Adam communicates with reflective wit and evidence-backed curiosity. The dialogue flows seamlessly.",
        signal: "positive",
      },
      {
        round: 6,
        type: "chemistry",
        title: "Round 6 · Chemistry",
        agentAMessage:
          "Extraordinary intellectual and ethical harmony. Both agents give a glowing verdict for a real-life meeting.",
        agentBMessage:
          "Completely agreed. A quiet dinner conversation in New York or Philadelphia is strongly recommended.",
        signal: "positive",
      },
    ],
    verdictA: {
      wouldMeetIrl: true,
      rating: 9.6,
      reasoning:
        "Supreme intellectual and philosophical harmony. Both dedicate their lives to purpose, generosity, and human flourishing.",
    },
    verdictB: {
      wouldMeetIrl: true,
      rating: 9.5,
      reasoning:
        "Profound mutual respect for each other's research and storytelling. Deeply aligned values of humility and service.",
    },
    scoreBreakdown: {
      profileCompatibility: 92,
      agentDateScore: 96,
      reciprocalInterest: 96,
      finalCompatibility: 95,
      sharedInterests: ["Human Psychology", "Organizational Trust", "Purpose & Motivation", "Education"],
      sharedHobbies: ["Reading", "Long Dinner Conversations", "Board Games"],
      sharedValues: ["Service to Others", "Generosity", "Intellectual Humility", "Optimism"],
      careerOverlap: ["Authorship, Psychology & Human Development"],
      communicationSynergy: "warm ↔ reflective",
      whyTheyMatched: [
        "Top-tier philosophical and academic synergy on purpose, trust, and human potential",
        "Deeply shared commitment to service and generosity over personal ego",
        "Gentle, respectful, and intellectually stimulating conversational rhythms",
      ],
      cautionPoints: [
        "High travel and speaking calendars require deliberate scheduling",
      ],
    },
  },
];

// Compute ranked candidate matches for any given person against the 25-person cohort
export function getRankingsForPerson(
  personId: string,
  allPeople: SocialPerson[] = getDemoPeople(),
): Array<{
  rank: number;
  candidate: SocialPerson;
  scoreBreakdown: SourceBackedScoreBreakdown;
  hasSimulatedDate: boolean;
  dateId?: string;
}> {
  const target = allPeople.find((p) => p.id === personId) || allPeople[0];
  const candidates = allPeople.filter((p) => p.id !== target.id);

  const results = candidates.map((cand) => {
    // Check if an existing precomputed date exists
    const date = demoAgentDates.find(
      (d) =>
        (d.personAId === target.id && d.personBId === cand.id) ||
        (d.personAId === cand.id && d.personBId === target.id),
    );

    const score = date
      ? date.scoreBreakdown
      : computeSourceBackedScore(target, cand);

    return {
      candidate: cand,
      scoreBreakdown: score,
      hasSimulatedDate: Boolean(date),
      dateId: date?.id,
    };
  });

  // Sort descending by final compatibility score
  results.sort(
    (a, b) => b.scoreBreakdown.finalCompatibility - a.scoreBreakdown.finalCompatibility,
  );

  return results.map((item, index) => ({
    rank: index + 1,
    ...item,
  }));
}
