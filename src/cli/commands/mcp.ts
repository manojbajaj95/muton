import { startMcpServer } from "../../mcp/index.ts";

export async function cmdMcp(): Promise<void> {
  await startMcpServer();
}
