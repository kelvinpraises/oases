import {
  buildReplayTicket,
  verifyReplayTicket,
} from "./proof/ticket";
import type {
  ResolutionDecision,
  PrecedenceProof,
  BlockSnapshot,
  ReplayTicket,
  TicketVerificationResult,
} from "./proof/types";

export { buildReplayTicket, verifyReplayTicket };
export type {
  ResolutionDecision,
  PrecedenceProof,
  BlockSnapshot,
  ReplayTicket,
  TicketVerificationResult,
};
