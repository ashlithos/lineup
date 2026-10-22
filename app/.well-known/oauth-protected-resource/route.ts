import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { AUTH_SERVER_URL } from "@/lib/mcp/auth";

// RFC 9728 metadata: tells Claude that /mcp signs in through the Supabase
// OAuth 2.1 server of the identity project (see lib/mcp/auth.ts).
// withMcpAuth's 401 challenge points here.
const handler = protectedResourceHandler({ authServerUrls: [AUTH_SERVER_URL] });
const options = metadataCorsOptionsRequestHandler();

export { handler as GET, options as OPTIONS };
