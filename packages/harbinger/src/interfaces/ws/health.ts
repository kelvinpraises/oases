import type { WebSocketStreamServer } from "./server";

export interface WebSocketServerHealth {
  status: "healthy" | "stopped";
  connectedClients: number;
  port: number;
}

export function getWsServerHealth(server: WebSocketStreamServer): WebSocketServerHealth {
  const clientCount = server.getConnectedClientCount();
  const port = server.getPort();

  return {
    status: port > 0 ? "healthy" : "stopped",
    connectedClients: clientCount,
    port,
  };
}
