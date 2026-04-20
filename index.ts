import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { Resolver } from "dns";
import { promisify } from "util";
import { isIPv4, isIPv6 } from "net";

/**
 * Validates a URL to prevent Server-Side Request Forgery (SSRF) attacks.
 *
 * - Only allows http: and https: schemes.
 * - If the hostname is already a bare IP address it is validated directly.
 * - Otherwise the hostname is resolved via DNS; if resolution fails entirely
 *   the request is rejected.
 * - Every resolved address is checked against isForbiddenAddress().
 *
 * @throws {Error} if the URL is invalid or targets a forbidden destination.
 */
async function validateUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Forbidden URL scheme "${parsed.protocol}" – only http and https are allowed`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  let addresses: string[];

  if (isIPv4(hostname) || isIPv6(hostname)) {
    // Hostname is already a bare IP address – validate it directly
    addresses = [hostname];
  } else {
    // Resolve via DNS and reject if resolution fails entirely
    const resolver = new Resolver();
    const resolve4 = promisify(resolver.resolve4.bind(resolver));
    const resolve6 = promisify(resolver.resolve6.bind(resolver));

    const v4 = await resolve4(hostname).catch(() => [] as string[]);
    const v6 = await resolve6(hostname).catch(() => [] as string[]);

    if (v4.length === 0 && v6.length === 0) {
      throw new Error(`Unable to resolve hostname "${hostname}" – request rejected`);
    }

    addresses = [...v4, ...v6];
  }

  for (const addr of addresses) {
    if (isForbiddenAddress(addr)) {
      throw new Error(`Forbidden destination address "${addr}" – requests to private, loopback, link-local, or metadata addresses are not allowed`);
    }
  }
}

/**
 * Returns true if the given IP address (IPv4 or IPv6) falls in a forbidden
 * range: loopback, link-local, private (RFC 1918 / RFC 4193), multicast,
 * IPv6-mapped IPv4 private ranges, or well-known cloud metadata addresses.
 *
 * Unknown/unrecognised address formats are treated as forbidden.
 */
function isForbiddenAddress(addr: string): boolean {
  if (isIPv6(addr)) {
    const lower = addr.toLowerCase();

    // Loopback (::1) and unspecified (::)
    if (
      lower === "::1" ||
      lower === "::" ||
      lower === "0:0:0:0:0:0:0:1" ||
      lower === "0:0:0:0:0:0:0:0"
    ) {
      return true;
    }

    // IPv6-mapped IPv4 (::ffff:x.x.x.x) – check the embedded IPv4
    const mappedV4 = extractMappedIPv4(lower);
    if (mappedV4 !== null) {
      return isForbiddenAddress(mappedV4);
    }

    // Link-local fe80::/10
    if (/^fe[89ab][0-9a-f]/i.test(lower)) {
      return true;
    }

    // Unique-local fc00::/7 (fc:: and fd::)
    if (/^f[cd][0-9a-f]{2}:/i.test(lower)) {
      return true;
    }

    // Multicast ff00::/8
    if (/^ff/i.test(lower)) {
      return true;
    }

    return false;
  }

  if (isIPv4(addr)) {
    const [a, b, c] = addr.split(".").map(Number);

    // 127.0.0.0/8 – loopback
    if (a === 127) return true;
    // 0.0.0.0/8 – "this" network
    if (a === 0) return true;
    // 10.0.0.0/8 – private
    if (a === 10) return true;
    // 172.16.0.0/12 – private
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 – private
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 – link-local (covers AWS/GCP/Azure metadata at 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 100.64.0.0/10 – shared address space (RFC 6598)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 192.0.0.0/24 – IETF protocol assignments
    if (a === 192 && b === 0 && c === 0) return true;
    // 198.18.0.0/15 – benchmark testing
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 240.0.0.0/4 – reserved
    if (a >= 240) return true;
    // 255.255.255.255/32 – broadcast
    if (addr === "255.255.255.255") return true;
    // Multicast 224.0.0.0/4
    if (a >= 224 && a <= 239) return true;

    return false;
  }

  // Unknown address format – reject to be safe
  return true;
}

/**
 * If addr is an IPv6-mapped IPv4 address (::ffff:x.x.x.x or its expanded
 * form), returns the embedded IPv4 string; otherwise returns null.
 */
function extractMappedIPv4(addr: string): string | null {
  // Compact form: ::ffff:a.b.c.d
  const compact = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (compact) return compact[1];

  // Expanded form: 0:0:0:0:0:ffff:a.b.c.d
  const expanded = addr.match(/^(?:0+:){5}ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (expanded) return expanded[1];

  return null;
}

/**
 * Configuration loading with precedence:
 * 1. Environment variables
 * 2. MCP arguments
 * 3. Default values
 */

// Default configuration
let CONFIG = {
  DIRECTUS_URL: "https://example.com",
  DIRECTUS_ACCESS_TOKEN: "default-token-for-dev",
  DIRECTUS_EMAIL: "user@example.com",
  DIRECTUS_PASSWORD: "default-password-for-dev"
};

// Load environment variables if present
if (process.env.DIRECTUS_URL) {
  CONFIG.DIRECTUS_URL = process.env.DIRECTUS_URL;
}
if (process.env.DIRECTUS_ACCESS_TOKEN) {
  CONFIG.DIRECTUS_ACCESS_TOKEN = process.env.DIRECTUS_ACCESS_TOKEN;
}
if (process.env.DIRECTUS_EMAIL) {
  CONFIG.DIRECTUS_EMAIL = process.env.DIRECTUS_EMAIL;
}
if (process.env.DIRECTUS_PASSWORD) {
  CONFIG.DIRECTUS_PASSWORD = process.env.DIRECTUS_PASSWORD;
}

// Parse server arguments if provided
const serverArgs = process.argv.slice(2);
serverArgs.forEach(arg => {
  if (arg.startsWith('--directus-url=')) {
    CONFIG.DIRECTUS_URL = arg.split('=')[1];
  } else if (arg.startsWith('--directus-token=')) {
    CONFIG.DIRECTUS_ACCESS_TOKEN = arg.split('=')[1];
  } else if (arg.startsWith('--directus-email=')) {
    CONFIG.DIRECTUS_EMAIL = arg.split('=')[1];
  } else if (arg.startsWith('--directus-password=')) {
    CONFIG.DIRECTUS_PASSWORD = arg.split('=')[1];
  }
});

// Create MCP server
const server = new Server({
  name: "directus-api-extended",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Helper function to build headers with authentication token
const buildHeaders = (token: string): Record<string, string> => {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

// Function to get an authentication token
async function getAuthToken(url: string, email: string, password: string): Promise<string> {
  try {
    const response = await axios.post(`${url}/auth/login`, {
      email,
      password
    });
    
    return response.data.data.access_token;
  } catch (error: any) {
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "getItems",
        description: "Get items from a collection in Directus",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            collection: { 
              type: "string", 
              description: "Collection name" 
            },
            query: { 
              type: "object", 
              description: "Query parameters like filter, sort, limit, etc. (optional)"
            }
          },
          required: ["collection"]
        }
      },
      {
        name: "getItem",
        description: "Get a single item from a collection by ID",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            collection: { 
              type: "string", 
              description: "Collection name"
            },
            id: { 
              type: "string", 
              description: "Item ID"
            },
            query: { 
              type: "object", 
              description: "Query parameters (optional)"
            }
          },
          required: ["collection", "id"]
        }
      },
      {
        name: "createItem",
        description: "Create a new item in a collection",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            collection: { 
              type: "string", 
              description: "Collection name"
            },
            data: { 
              type: "object", 
              description: "Item data"
            }
          },
          required: ["collection", "data"]
        }
      },
      {
        name: "updateItem",
        description: "Update an existing item in a collection",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            collection: { 
              type: "string", 
              description: "Collection name"
            },
            id: { 
              type: "string", 
              description: "Item ID"
            },
            data: { 
              type: "object", 
              description: "Updated item data"
            }
          },
          required: ["collection", "id", "data"]
        }
      },
      {
        name: "deleteItem",
        description: "Delete an item from a collection",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            collection: { 
              type: "string", 
              description: "Collection name"
            },
            id: { 
              type: "string", 
              description: "Item ID"
            }
          },
          required: ["collection", "id"]
        }
      },
      {
        name: "getSystemInfo",
        description: "Get system information from Directus",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            endpoint: { 
              type: "string", 
              description: "System endpoint (e.g. 'health', 'info', 'activity')"
            }
          },
          required: ["endpoint"]
        }
      },
      {
        name: "getCollections",
        description: "Get all collection schemas from Directus",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            }
          },
          required: []
        }
      },
      {
        name: "login",
        description: "Login to Directus and get an access token",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            email: { 
              type: "string", 
              description: "User email (default from config)"
            },
            password: { 
              type: "string", 
              description: "User password (default from config)"
            }
          },
          required: []
        }
      },
      {
        name: "getActivity",
        description: "Get activity logs from Directus",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            query: {
              type: "object",
              description: "Query parameters like filter, sort, limit, etc. (optional)"
            }
          },
          required: []
        }
      },
      {
        name: "getFields",
        description: "Get fields for a collection",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            collection: {
              type: "string",
              description: "Collection name"
            }
          },
          required: ["collection"]
        }
      },
      {
        name: "getRelations",
        description: "Get relations for a collection",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            collection: {
              type: "string",
              description: "Collection name (optional)"
            }
          },
          required: []
        }
      },
      {
        name: "getFiles",
        description: "Get files from Directus",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            query: {
              type: "object",
              description: "Query parameters like filter, sort, limit, etc. (optional)"
            }
          },
          required: []
        }
      },
      {
        name: "uploadFile",
        description: "Upload a file to Directus",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            fileUrl: {
              type: "string",
              description: "URL of the file to upload (either fileUrl or fileData must be provided)"
            },
            fileData: {
              type: "string",
              description: "Base64 encoded file data (either fileUrl or fileData must be provided)"
            },
            fileName: {
              type: "string",
              description: "Name of the file"
            },
            mimeType: {
              type: "string",
              description: "MIME type of the file"
            },
            storage: {
              type: "string",
              description: "Storage location (optional)"
            },
            title: {
              type: "string",
              description: "File title (optional)"
            }
          },
          required: ["fileName"]
        }
      },
      {
        name: "getUsers",
        description: "Get users from Directus",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            query: {
              type: "object",
              description: "Query parameters like filter, sort, limit, etc. (optional)"
            }
          },
          required: []
        }
      },
      {
        name: "getCurrentUser",
        description: "Get the current user info",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            }
          },
          required: []
        }
      },
      {
        name: "getRoles",
        description: "Get roles from Directus",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            query: {
              type: "object",
              description: "Query parameters like filter, sort, limit, etc. (optional)"
            }
          },
          required: []
        }
      },
      {
        name: "getPermissions",
        description: "Get permissions from Directus",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "Directus API URL (default from config)"
            },
            token: { 
              type: "string", 
              description: "Authentication token (default from config)"
            },
            query: {
              type: "object",
              description: "Query parameters like filter, sort, limit, etc. (optional)"
            }
          },
          required: []
        }
      },
      {
        name: "getConfig",
        description: "Get current configuration information (without secrets)",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      }
    ]
  };
});

// Implement tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  // Type assertion for arguments
  const toolArgs = request.params.arguments as Record<string, any>;
  
  // Set default URL if not provided
  const url = toolArgs.url || CONFIG.DIRECTUS_URL;

  // Validate the Directus API URL to prevent SSRF via per-request url override
  await validateUrl(url);

  try {
    switch (toolName) {
      case "getConfig": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                directus_url: CONFIG.DIRECTUS_URL,
                using_token: CONFIG.DIRECTUS_ACCESS_TOKEN ? true : false,
                using_email: CONFIG.DIRECTUS_EMAIL ? true : false,
                environment_variables: {
                  DIRECTUS_URL: !!process.env.DIRECTUS_URL,
                  DIRECTUS_ACCESS_TOKEN: !!process.env.DIRECTUS_ACCESS_TOKEN,
                  DIRECTUS_EMAIL: !!process.env.DIRECTUS_EMAIL,
                  DIRECTUS_PASSWORD: !!process.env.DIRECTUS_PASSWORD
                },
                // List any server arguments provided
                server_args: serverArgs
              }, null, 2)
            }
          ]
        };
      }
        
      case "login": {
        const email = toolArgs.email || CONFIG.DIRECTUS_EMAIL;
        const password = toolArgs.password || CONFIG.DIRECTUS_PASSWORD;
        
        const token = await getAuthToken(url, email, password);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ access_token: token }, null, 2)
            }
          ]
        };
      }
      
      case "getCollections": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        
        const response = await axios.get(
          `${url}/collections`,
          { headers: buildHeaders(token) }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }
      
      case "getItems": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const collection = toolArgs.collection as string;
        const query = toolArgs.query as Record<string, any> | undefined;
        
        const response = await axios.get(
          `${url}/items/${collection}`, 
          { 
            headers: buildHeaders(token),
            params: query
          }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }
      
      case "getItem": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const collection = toolArgs.collection as string;
        const id = toolArgs.id as string | number;
        const query = toolArgs.query as Record<string, any> | undefined;
        
        const response = await axios.get(
          `${url}/items/${collection}/${id}`, 
          { 
            headers: buildHeaders(token),
            params: query
          }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }
      
      case "createItem": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const collection = toolArgs.collection as string;
        const data = toolArgs.data as Record<string, any>;
        
        const response = await axios.post(
          `${url}/items/${collection}`,
          data,
          { headers: buildHeaders(token) }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }
      
      case "updateItem": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const collection = toolArgs.collection as string;
        const id = toolArgs.id as string | number;
        const data = toolArgs.data as Record<string, any>;
        
        const response = await axios.patch(
          `${url}/items/${collection}/${id}`,
          data,
          { headers: buildHeaders(token) }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }
      
      case "deleteItem": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const collection = toolArgs.collection as string;
        const id = toolArgs.id as string | number;
        
        await axios.delete(
          `${url}/items/${collection}/${id}`,
          { headers: buildHeaders(token) }
        );
        
        return {
          content: [
            {
              type: "text",
              text: "Item deleted successfully"
            }
          ]
        };
      }
      
      case "getSystemInfo": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const endpoint = toolArgs.endpoint as string;
        
        const response = await axios.get(
          `${url}/server/${endpoint}`,
          { headers: buildHeaders(token) }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }

      case "getActivity": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const query = toolArgs.query as Record<string, any> | undefined;
        
        const response = await axios.get(
          `${url}/activity`,
          { 
            headers: buildHeaders(token),
            params: query
          }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }

      case "getFields": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const collection = toolArgs.collection as string;
        
        const response = await axios.get(
          `${url}/fields/${collection}`,
          { headers: buildHeaders(token) }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }

      case "getRelations": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const collection = toolArgs.collection as string | undefined;
        
        let endpoint = `${url}/relations`;
        if (collection) {
          endpoint += `/${collection}`;
        }
        
        const response = await axios.get(
          endpoint,
          { headers: buildHeaders(token) }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }

      case "getFiles": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const query = toolArgs.query as Record<string, any> | undefined;
        
        const response = await axios.get(
          `${url}/files`,
          { 
            headers: buildHeaders(token),
            params: query
          }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }

      case "uploadFile": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const fileName = toolArgs.fileName as string;
        const fileUrl = toolArgs.fileUrl as string | undefined;
        const fileData = toolArgs.fileData as string | undefined;
        const mimeType = toolArgs.mimeType as string | undefined;
        const storage = toolArgs.storage as string | undefined;
        const title = toolArgs.title as string | undefined;
        
        let fileContent: Buffer;
        
        // Get file data either from URL or base64 data
        if (fileUrl) {
          // Validate fileUrl before fetching to prevent SSRF
          await validateUrl(fileUrl);
          const fileResponse = await axios.get(fileUrl, {
            responseType: 'arraybuffer',
            maxRedirects: 0  // disable redirects to prevent SSRF via redirect chains
          });
          fileContent = Buffer.from(fileResponse.data);
        } else if (fileData) {
          fileContent = Buffer.from(fileData, 'base64');
        } else {
          throw new Error("Either fileUrl or fileData must be provided");
        }
        
        // Create form data for file upload
        const FormData = (await import('form-data')).default;
        const formData = new FormData();
        
        formData.append('file', fileContent, {
          filename: fileName,
          contentType: mimeType
        });
        
        if (storage) {
          formData.append('storage', storage);
        }
        
        if (title) {
          formData.append('title', title);
        }
        
        const response = await axios.post(
          `${url}/files`,
          formData,
          { 
            headers: {
              ...buildHeaders(token),
              ...formData.getHeaders()
            }
          }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }

      case "getUsers": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const query = toolArgs.query as Record<string, any> | undefined;
        
        const response = await axios.get(
          `${url}/users`,
          { 
            headers: buildHeaders(token),
            params: query
          }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }

      case "getCurrentUser": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        
        const response = await axios.get(
          `${url}/users/me`,
          { headers: buildHeaders(token) }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }

      case "getRoles": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const query = toolArgs.query as Record<string, any> | undefined;
        
        const response = await axios.get(
          `${url}/roles`,
          { 
            headers: buildHeaders(token),
            params: query
          }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }

      case "getPermissions": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const query = toolArgs.query as Record<string, any> | undefined;
        
        const response = await axios.get(
          `${url}/permissions`,
          { 
            headers: buildHeaders(token),
            params: query
          }
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }
      
      default:
        throw new Error(`Tool "${toolName}" not found`);
    }
  } catch (error: any) {
    // Handle API errors
    const errorMessage = error.response?.data?.errors 
      ? JSON.stringify(error.response.data.errors, null, 2)
      : error.message;
      
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`
        }
      ]
    };
  }
});

// Server startup
const transport = new StdioServerTransport();
server.connect(transport);