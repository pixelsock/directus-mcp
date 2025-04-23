[![smithery badge](https://smithery.ai/badge/@pixelsock/directus-mcp)](https://smithery.ai/server/@pixelsock/directus-mcp)

# Directus MCP Server

A Node.js server implementing Model Context Protocol (MCP) for Directus CMS. Enable AI Clients to interact with the [Directus API](https://docs.directus.io/reference/introduction.html) through the Model Context Protocol (MCP).

<a href="https://glama.ai/mcp/servers/@pixelsock/directus-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@pixelsock/directus-mcp/badge" alt="Directus Server MCP server" />
</a>

## ℹ Prerequisites

- [Node.js](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [NPM](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [A Directus Instance](https://directus.io/guides/get-started-with-directus-cloud)

## ▶️ Quick start

1. **Get your Directus API credentials**

   - Go to your Directus instance
   - Create a static access token or get your email and password
   - Keep these credentials secure

2. **Add to your AI editor**

   ```json
   {
     "mcpServers": {
       "directus": {
         "command": "npx",
         "args": ["-y", "@pixelsock/directus-mcp@latest"],
         "env": {
           "DIRECTUS_URL": "https://your-directus-instance.com",
           "DIRECTUS_ACCESS_TOKEN": "YOUR_ACCESS_TOKEN"
         }
       }
     }
   }
   ```

   Alternatively, you can use email/password authentication:

   ```json
   {
     "mcpServers": {
       "directus": {
         "command": "npx",
         "args": ["-y", "@pixelsock/directus-mcp@latest"],
         "env": {
           "DIRECTUS_URL": "https://your-directus-instance.com",
           "DIRECTUS_EMAIL": "your-email@example.com",
           "DIRECTUS_PASSWORD": "your-password"
         }
       }
     }
   }
   ```

   **For Cursor:**

   1. Go to Settings → Cursor Settings → MCP
   2. Click `+ Add New Global MCP Server`
   3. Paste configuration
   4. Replace placeholder values with your Directus credentials
   5. Save and **restart** Cursor

   **For Claude Desktop:**

   1. Open Settings → Developer
   2. Click `Edit Config`
   3. Open `claude_desktop_config.json` in a code editor and paste configuration
   4. Replace placeholder values with your Directus credentials
   5. Save and **restart** Claude

## ❓ Troubleshooting

If you are having issues starting the server in your MCP client e.g. Cursor or Claude Desktop, please try the following.

### Ensure you have valid Directus credentials

1. Verify that your Directus URL is correct and accessible
2. Check that your access token or email/password credentials are valid
3. Replace the credentials in your MCP client configuration
4. Save and **restart** your MCP client

### Ensure you have Node and NPM installed

- [Node.js](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [NPM](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)

Run the following commands to confirm you have Node and NPM installed:

```shell
node -v
npm -v
```

### Clear your NPM cache

Sometimes clearing your [NPM cache](https://docs.npmjs.com/cli/v8/commands/npm-cache) can resolve issues with `npx`.

```shell
npm cache clean --force
```

## 🛠️ Available tools

### Collections and Items

```
getItems                // Get items from a collection
getItem                 // Get a single item from a collection by ID
createItem              // Create a new item in a collection
updateItem              // Update an existing item in a collection
deleteItem              // Delete an item from a collection
getCollections          // Get all collection schemas
getFields               // Get fields for a collection
getRelations            // Get relations for a collection
```

### Files

```
getFiles                // Get files from Directus
uploadFile              // Upload a file to Directus
```

### Users and Permissions

```
login                   // Login to Directus and get an access token
getUsers                // Get users from Directus
getCurrentUser          // Get the current user info
getRoles                // Get roles from Directus
getPermissions          // Get permissions from Directus
```

### System

```
getSystemInfo           // Get system information from Directus
getActivity             // Get activity logs from Directus
getConfig               // Get current configuration information
```

## 🚧 Development mode

If you want to run the server in development mode:

1. Clone and install:

   ```shell
   git clone https://github.com/pixelsock/directus-mcp.git
   cd directus-mcp
   npm install
   ```

2. Add your credentials to `.env`:

   ```shell
   # .env
   DIRECTUS_URL=https://your-directus-instance.com
   DIRECTUS_ACCESS_TOKEN=your_token_here
   # Or use email/password
   DIRECTUS_EMAIL=your-email@example.com
   DIRECTUS_PASSWORD=your-password
   ```

3. Start development server:
   ```shell
   npm run dev
   ```

## 📄 Directus Developer resources

- [Directus API Documentation](https://docs.directus.io/reference/introduction.html)
- [Directus API Endpoints](https://docs.directus.io/reference/rest-api.html)
- [Directus JavaScript SDK](https://docs.directus.io/guides/sdk/getting-started.html) 