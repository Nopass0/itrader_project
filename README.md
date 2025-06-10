# itrader_project

A P2P trading automation system with WebSocket API for remote control and monitoring.

## Installation

```bash
bun install
```

## Running the Application

```bash
# Run main application (includes WebSocket server)
bun run src/app.ts

# Or use the start script
./start.sh
```

## WebSocket Server

The application includes a Socket.IO WebSocket server for remote control and monitoring. It automatically starts on port 3001 (configurable via WEBSOCKET_PORT environment variable).

### Features

- **Authentication**: JWT-based authentication with role-based access control
- **Real-time Updates**: Get instant notifications about transactions, payments, and system events
- **Full System Control**: Manage transactions, payouts, advertisements, exchange rates, and more
- **Chat Automation**: Configure templates and auto-responses for P2P chats
- **Monitoring**: Track system status, view logs, and get statistics
- **Multi-user Support**: Admin, Operator, and Viewer roles

### Account Management

```bash
# Create admin account
bun run manage-webserver-accounts.ts create admin admin

# Create operator account
bun run manage-webserver-accounts.ts create john operator

# List all accounts
bun run manage-webserver-accounts.ts list

# Reset password
bun run manage-webserver-accounts.ts reset john

# See all commands
bun run manage-webserver-accounts.ts
```

### API Documentation

See [test_scripts/webserver-example.md](test_scripts/webserver-example.md) for complete API documentation and examples.

## Project Structure

- `src/` - Main application source code
  - `app.ts` - Main application entry point
  - `webserver/` - WebSocket server implementation
  - `services/` - Business logic services
  - `bybit/` - Bybit P2P integration
  - `gate/` - Gate.io integration
  - `gmail/` - Gmail integration
  - `ocr/` - Receipt parsing
- `prisma/` - Database schema and migrations
- `test_scripts/` - Testing and utility scripts

## Configuration

The system uses SQLite database and stores configuration in the database. Key settings:

- **Mode**: `manual` or `automatic` - controls whether user confirmation is required
- **Exchange Rate**: Can be set to constant or automatic mode
- **Gmail**: OAuth2 authentication for receipt processing

This project was created using `bun init` in bun v1.2.2. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
