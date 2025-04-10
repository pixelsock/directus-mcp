#!/bin/bash

# Get the current directory
CURRENT_DIR=$(pwd)

# Check if .cursor directory exists in the user's home directory
CURSOR_DIR=~/.cursor
if [ ! -d "$CURSOR_DIR" ]; then
  echo "Error: Cursor directory not found at ~/.cursor"
  exit 1
fi

# Check if mcp.json exists
MCP_JSON="$CURSOR_DIR/mcp.json"
if [ ! -f "$MCP_JSON" ]; then
  # Create a new mcp.json file
  echo "{\"mcpServers\":{}}" > "$MCP_JSON"
  echo "Created new mcp.json file"
fi

# Use jq to add the directus-api-extended server to mcp.json
# Install jq if not available with: brew install jq (macOS) or apt-get install jq (Linux)
if command -v jq &> /dev/null; then
  jq --arg path "$CURRENT_DIR/dist/index.js" '.mcpServers["directus-api-extended"] = {"command": "node", "args": [$path]}' "$MCP_JSON" > "$MCP_JSON.tmp" && mv "$MCP_JSON.tmp" "$MCP_JSON"
  echo "Added directus-api-extended server to Cursor MCP configuration"
else
  echo "Warning: jq is not installed. Please install jq or manually add the server to your mcp.json file."
  echo "Add the following to your $MCP_JSON file:"
  echo
  echo "{
  \"mcpServers\": {
    \"directus-api-extended\": {
      \"command\": \"node\",
      \"args\": [
        \"$CURRENT_DIR/dist/index.js\"
      ]
    }
  }
}"
fi

echo "Done!" 