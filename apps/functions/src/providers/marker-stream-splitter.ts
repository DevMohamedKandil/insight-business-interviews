/**
 * Splits a single streamed completion into a human-facing reply stream and a trailing
 * structured-JSON tail, using a delimiter marker — the mechanism behind ADR-0013
 * (real provider-token streaming + single-call structured output, without ever
 * forwarding partial JSON syntax to the respondent-facing UI).
 *
 * Holds back the last `marker.length - 1` characters of the buffer at all times so a
 * marker split across two stream chunks is never mistakenly flushed as reply text.
 */
export class MarkerStreamSplitter {
  private buffer = '';
  private markerFound = false;
  private tail = '';
  private replyTextSoFar = '';

  constructor(private readonly marker: string) {}

  /** Feed a new chunk of raw streamed text. Returns the portion now safe to show the
   *  respondent (empty string once the marker has been found). */
  push(chunk: string): string {
    if (this.markerFound) {
      this.tail += chunk;
      return '';
    }

    this.buffer += chunk;
    const markerIndex = this.buffer.indexOf(this.marker);

    if (markerIndex !== -1) {
      const safeReplyText = this.buffer.slice(0, markerIndex);
      this.tail = this.buffer.slice(markerIndex + this.marker.length);
      this.buffer = '';
      this.markerFound = true;
      this.replyTextSoFar += safeReplyText;
      return safeReplyText;
    }

    const holdback = this.marker.length - 1;
    if (this.buffer.length > holdback) {
      const safe = this.buffer.slice(0, this.buffer.length - holdback);
      this.buffer = this.buffer.slice(this.buffer.length - holdback);
      this.replyTextSoFar += safe;
      return safe;
    }
    return '';
  }

  /** Call once the underlying stream has ended. If the marker was never found
   *  (model didn't follow the format — provider treats this as a fallback,
   *  never a crash), whatever is left in the buffer is flushed as reply text too. */
  finish(): { replyText: string; jsonTail: string; markerFound: boolean } {
    if (!this.markerFound && this.buffer) {
      this.replyTextSoFar += this.buffer;
      this.buffer = '';
    }
    return { replyText: this.replyTextSoFar, jsonTail: this.tail.trim(), markerFound: this.markerFound };
  }
}
