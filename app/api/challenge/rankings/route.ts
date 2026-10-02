import { NextRequest, NextResponse } from "next/server";
import { demoAgentDates, getDemoPeople, getRankingsForPerson } from "@/lib/data/demoPeople";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const personId = url.searchParams.get("personId") || "person_001";
  const allPeople = getDemoPeople();
  const currentPerson = allPeople.find((p) => p.id === personId) || allPeople[0];
  const rankings = getRankingsForPerson(currentPerson.id, allPeople);

  return NextResponse.json({
    person: currentPerson,
    rankings,
    allPeople: allPeople.map((p) => ({
      id: p.id,
      name: p.name,
      headline: p.headline,
      location: p.location,
    })),
    availableDates: demoAgentDates.map((d) => ({
      id: d.id,
      personAId: d.personAId,
      personBId: d.personBId,
      score: d.scoreBreakdown.finalCompatibility,
    })),
  });
}
