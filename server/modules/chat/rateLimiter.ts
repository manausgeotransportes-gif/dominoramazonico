// Rate limiter simples para chat
const chatThrottle = new Map<number, number[]>();

export function validateChatRate(userId: number) {
  const now = Date.now();
  const timeline = (chatThrottle.get(userId) ?? []).filter((ts) => now - ts < 10000);
  if (timeline.length >= 5) {
    throw new Error("Muitas mensagens em pouco tempo");
  }
  timeline.push(now);
  chatThrottle.set(userId, timeline);
}
