const conversationTimeZone = "Europe/Amsterdam";

export function formatConversationTimestamp(value: string): string {
  return new Date(value).toLocaleString("nl-NL", { timeZone: conversationTimeZone });
}
