import { handleStreamableHttpRequest } from "../../utils/mcp-streamable-http";

export default defineEventHandler(async (event) => {
  await handleStreamableHttpRequest(event);
});
