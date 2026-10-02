import { NextRequest, NextResponse } from "next/server";
import { demoAgentDates, getDemoPeople } from "@/lib/data/demoPeople";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const date = demoAgentDates.find((d) => d.id === id);

  if (!date) {
    return NextResponse.json({ error: "date_not_found" }, { status: 404 });
  }

  const allPeople = getDemoPeople();
  const personA = allPeople.find((p) => p.id === date.personAId);
  const personB = allPeople.find((p) => p.id === date.personBId);

  return NextResponse.json({
    date,
    personA,
    personB,
  });
}
