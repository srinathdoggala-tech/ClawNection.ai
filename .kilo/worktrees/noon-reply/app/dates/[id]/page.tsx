import { DateDetailClient } from "./DateDetailClient";

export const dynamic = "force-dynamic";

export default async function DateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DateDetailClient dateId={id} />;
}
