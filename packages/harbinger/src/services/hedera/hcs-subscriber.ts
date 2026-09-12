export interface HcsPitchPayload {
  marketId: string;
  targetAddress: string;
  thesis: string;
  metricKey: string;
  timebox: number;
  payerTxId: string;
}

export interface HcsPeerMessage {
  consensusTimestamp: string;
  sequenceNumber: number;
  topicId: string;
  sender: string;
  priority: "HIGH" | "LOW";
  payload: HcsPitchPayload;
}

export interface HcsSubscriberOptions {
  mirrorNodeUrl?: string;
  pollIntervalMs?: number;
}

export class HcsMirrorNodeSubscriber {
  private readonly mirrorNodeUrl: string;
  private readonly pollIntervalMs: number;
  private readonly processedPayerTxs = new Set<string>();
  private pollingActive = false;
  private pollTimeout?: NodeJS.Timeout;
  private lastTimestamp?: string;

  constructor(
    public readonly topicId: string,
    options?: HcsSubscriberOptions,
  ) {
    this.mirrorNodeUrl = options?.mirrorNodeUrl ?? "https://testnet.mirrornode.hedera.com";
    this.pollIntervalMs = options?.pollIntervalMs ?? 5000;
  }

  /**
   * Fetches new messages from the Hedera Mirror Node topic endpoint.
   * Filters out already-processed payerTxIds to prevent pitch replay.
   */
  public async fetchNewMessages(
    sinceTimestamp?: string,
  ): Promise<{ messages: HcsPeerMessage[]; nextTimestamp?: string }> {
    const timestampToUse = sinceTimestamp ?? this.lastTimestamp;
    const url = new URL(`/api/v1/topics/${this.topicId}/messages`, this.mirrorNodeUrl);
    url.searchParams.set("limit", "25");
    url.searchParams.set("order", "asc");
    if (timestampToUse) {
      url.searchParams.set("timestamp", `gt:${timestampToUse}`);
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Mirror Node query failed with HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      messages?: Array<{
        consensus_timestamp: string;
        sequence_number: number;
        message: string;
      }>;
    };

    const messages: HcsPeerMessage[] = [];
    let latestTs = timestampToUse;

    for (const raw of data.messages ?? []) {
      latestTs = raw.consensus_timestamp;
      try {
        const decodedStr = Buffer.from(raw.message, "base64").toString("utf-8");
        const parsed = JSON.parse(decodedStr);

        // Normalize payload
        const payload: HcsPitchPayload = {
          marketId: parsed.marketId ?? parsed.payload?.marketId ?? "",
          targetAddress: parsed.targetAddress ?? parsed.payload?.targetAddress ?? "",
          thesis: parsed.thesis ?? parsed.payload?.thesis ?? "",
          metricKey: parsed.metricKey ?? parsed.payload?.metricKey ?? "",
          timebox: Number(parsed.timebox ?? parsed.payload?.timebox ?? 100),
          payerTxId: parsed.payerTxId ?? parsed.payload?.payerTxId ?? `tx-${raw.sequence_number}`,
        };

        // Replay defense: ignore if payerTxId was already processed
        if (payload.payerTxId && this.processedPayerTxs.has(payload.payerTxId)) {
          continue;
        }

        if (payload.payerTxId) {
          this.processedPayerTxs.add(payload.payerTxId);
        }

        messages.push({
          consensusTimestamp: raw.consensus_timestamp,
          sequenceNumber: raw.sequence_number,
          topicId: this.topicId,
          sender: parsed.sender ?? `hcs-14:${this.topicId}`,
          priority: parsed.priority === "LOW" ? "LOW" : "HIGH",
          payload,
        });
      } catch {
        // Skip malformed individual frames
      }
    }

    this.lastTimestamp = latestTs;
    return { messages, nextTimestamp: latestTs };
  }

  /**
   * Starts background polling on the topic, feeding incoming messages to a handler.
   */
  public startPolling(onMessage: (message: HcsPeerMessage) => Promise<void>): void {
    if (this.pollingActive) return;
    this.pollingActive = true;

    const pollLoop = async () => {
      if (!this.pollingActive) return;
      try {
        const { messages } = await this.fetchNewMessages();
        for (const msg of messages) {
          await onMessage(msg);
        }
      } catch {
        // Resilience: log and retry on next interval
      }
      if (this.pollingActive) {
        this.pollTimeout = setTimeout(pollLoop, this.pollIntervalMs);
      }
    };

    void pollLoop();
  }

  public stopPolling(): void {
    this.pollingActive = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = undefined;
    }
  }

  public isProcessed(payerTxId: string): boolean {
    return this.processedPayerTxs.has(payerTxId);
  }
}
