import { randomUUID } from "node:crypto";

// Keep a single short-lived review per game session. A second tab, reconnect,
// payload edit or replay cannot silently execute the previously reviewed change.
export class OperationReview {
  private pending?: { ticket: string; command: number; json: string; expires: number };
  clear() {
    this.pending = undefined;
  }
  issue(command: number, payload: object) {
    const ticket = randomUUID();
    this.pending = {
      ticket,
      command,
      json: JSON.stringify(payload),
      expires: Date.now() + 120_000,
    };
    return ticket;
  }
  consume(ticket: unknown, command: number, payload: object) {
    const p = this.pending;
    if (
      !p ||
      ticket !== p.ticket ||
      Date.now() >= p.expires ||
      command !== p.command ||
      JSON.stringify(payload) !== p.json
    )
      return false;
    this.clear();
    return true;
  }
}
