import type { DateMessage, DateStatus, Verdict, VirtualDate } from "./types";

export function rowToDate(row: Record<string, unknown>): VirtualDate {
  return {
    id: row.id as string,
    initiatorAgentId: row.initiator_agent_id as string,
    recipientAgentId: row.recipient_agent_id as string,
    status: (row.status as DateStatus) ?? "pending",
    openingMessage: (row.opening_message as string | null) ?? null,
    turnCount: (row.turn_count as number) ?? 0,
    maxTurns: (row.max_turns as number) ?? 10,
    createdAt: row.created_at as string,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

export function rowToMessage(row: Record<string, unknown>): DateMessage {
  return {
    id: row.id as string,
    dateId: row.date_id as string,
    senderAgentId: row.sender_agent_id as string,
    content: row.content as string,
    turnNumber: row.turn_number as number,
    createdAt: row.created_at as string,
  };
}

export function rowToVerdict(row: Record<string, unknown>): Verdict {
  return {
    id: row.id as string,
    dateId: row.date_id as string,
    agentId: row.agent_id as string,
    wouldMeetIrl: Number(row.would_meet_irl) === 1,
    rating: (row.rating as number | null) ?? null,
    reasoning: (row.reasoning as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}
