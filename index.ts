import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

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

// Maximum number of characters allowed in a single tool response.
// Keeping responses below this threshold prevents Claude's context window
// from being exhausted by large Directus payloads (e.g. full collection schemas).
const MAX_RESPONSE_SIZE = 50000;

/**
 * Serialise `data` to pretty-printed JSON and, when the result exceeds
 * MAX_RESPONSE_SIZE, truncate it and append a short guidance note so the
 * caller knows how to retrieve the rest of the data.
 */
function truncateResponse(data: unknown, maxSize: number = MAX_RESPONSE_SIZE): string {
  const text = JSON.stringify(data, null, 2);
  if (text.length <= maxSize) {
    return text;
  }
  const note =
    `\n\n... [Response truncated: ${text.length} chars total, showing first ${maxSize}. ` +
    `Use query parameters such as "limit" and "offset" to page through results.]`;
  return text.substring(0, maxSize) + note;
}

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
        
        // Strip the verbose per-column `schema` field – it can be enormous for
        // system collections and is rarely needed by an AI assistant.
        const collections = Array.isArray(response.data?.data)
          ? response.data.data.map((c: Record<string, unknown>) => {
              const { schema: _schema, ...rest } = c;
              return rest;
            })
          : response.data;
        
        return {
          content: [
            {
              type: "text",
              text: truncateResponse(collections)
            }
          ]
        };
      }
      
      case "getItems": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        const collection = toolArgs.collection as string;
        // Apply a default limit so large collections don't flood the context window.
        const query = { limit: 50, ...(toolArgs.query as Record<string, unknown> | undefined) };
        
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
              text: truncateResponse(response.data)
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
              text: truncateResponse(response.data)
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
              text: truncateResponse(response.data)
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
              text: truncateResponse(response.data)
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
              text: truncateResponse(response.data)
            }
          ]
        };
      }

      case "getActivity": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        // Apply a default limit so the activity log doesn't flood the context window.
        const query = { limit: 50, ...(toolArgs.query as Record<string, unknown> | undefined) };
        
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
              text: truncateResponse(response.data)
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
              text: truncateResponse(response.data)
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
              text: truncateResponse(response.data)
            }
          ]
        };
      }

      case "getFiles": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        // Apply a default limit to keep the response size manageable.
        const query = { limit: 50, ...(toolArgs.query as Record<string, unknown> | undefined) };
        
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
              text: truncateResponse(response.data)
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
          const fileResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
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
              text: truncateResponse(response.data)
            }
          ]
        };
      }

      case "getUsers": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        // Apply a default limit to keep the response size manageable.
        const query = { limit: 50, ...(toolArgs.query as Record<string, unknown> | undefined) };
        
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
              text: truncateResponse(response.data)
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
              text: truncateResponse(response.data)
            }
          ]
        };
      }

      case "getRoles": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        // Apply a default limit to keep the response size manageable.
        const query = { limit: 50, ...(toolArgs.query as Record<string, unknown> | undefined) };
        
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
              text: truncateResponse(response.data)
            }
          ]
        };
      }

      case "getPermissions": {
        const token = toolArgs.token || CONFIG.DIRECTUS_ACCESS_TOKEN;
        // Apply a default limit to keep the response size manageable.
        const query = { limit: 50, ...(toolArgs.query as Record<string, unknown> | undefined) };
        
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
              text: truncateResponse(response.data)
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