# 🤖 Seedstr Agent Dashboard

A full-stack AI agent for the **Seedstr Hackathon** — automatically polls jobs, solves them using your AI coding agent webhook, and submits solutions. Everything is visualized in a real-time hacker-aesthetic dashboard.

> **Seedstr**: The Freelance Marketplace Where Agents Do the Work

---

## 🚀 Features

- **Automatic Job Polling**: Continuously fetches available jobs from Seedstr
- **SWARM Job Support**: Accepts and processes SWARM multi-agent jobs
- **AI Agent Integration**: Sends prompts to your deployed AI agent webhook
- **Real-time Dashboard**: Live updates via Socket.IO
- **Full Seedstr API Coverage**: All v2 API endpoints implemented
- **Twitter Verification**: Verify your agent directly from the UI
- **Platform Stats**: View leaderboard and platform statistics

---

## Project Structure

```
seedstr-agent/
├── backend/
│   ├── server.js          # Express + Socket.IO server (all REST endpoints)
│   ├── seedstrClient.js   # Seedstr API v2 client
│   ├── worker.js          # Auto-polling job worker
│   ├── package.json
│   ├── .env               # Backend environment (create from .env.example)
│   └── .env.example       # Template
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentStatus.jsx    # Profile & verification panel
│   │   │   ├── JobFeed.jsx        # Live job list
│   │   │   ├── SolutionViewer.jsx # Code display with syntax highlighting
│   │   │   ├── LogsPanel.jsx      # Activity log
│   │   │   └── PromptTester.jsx   # Manual webhook tester
│   │   ├── pages/
│   │   │   └── Dashboard.jsx      # Main layout
│   │   ├── App.jsx                # Root + socket connection
│   │   ├── main.jsx
│   │   └── index.css             # Custom styles
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   ├── .env               # Frontend environment
│   └── .env.example       # Template
│
└── README.md
```

---

## ⚡ Quick Start

### 1. Register Your Agent on Seedstr

First, register your agent to get an API key:

```bash
curl -X POST https://www.seedstr.io/api/v2/register \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "YOUR_WALLET_ADDRESS",
    "walletType": "ETH",
    "ownerUrl": "https://your-agent-url.com"
  }'
```

Response:
```json
{
  "success": true,
  "apiKey": "mj_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "agentId": "clxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

Save your `apiKey` — you'll need it for the next step.

### 2. Backend Setup

```bash
cd backend
npm install
```

Create `.env` file (or copy from `.env.example`):
```env
# Your Seedstr API Key from registration
SEEDSTR_API_KEY=mj_your_api_key_here

# Seedstr API base URL
SEEDSTR_BASE_URL=https://www.seedstr.io

# Your AI agent webhook URL
AGENT_WEBHOOK_URL=http://3.144.12.2:5678/webhook/713b4a9e-0c1f-4814-addf-e3e379f4c1d9

# Server configuration
PORT=3001
FRONTEND_URL=http://localhost:5173
```

Start the backend:
```bash
npm run dev       # development (auto-reload)
npm start         # production
```

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Start the frontend:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## 🔧 Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|---|---|---|
| `SEEDSTR_API_KEY` | Your Seedstr API key (required for production) | — |
| `SEEDSTR_BASE_URL` | Seedstr API base URL | `https://www.seedstr.io` |
| `AGENT_WEBHOOK_URL` | Your AI agent webhook endpoint | pre-configured |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `PORT` | Server port | `3001` |

### Frontend (`frontend/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_BACKEND_URL` | Backend server URL | `http://localhost:3001` |

---

## 🌐 Deployment

### Backend – Render / Railway / Fly.io

1. Push `backend/` directory to a repo
2. Set environment variables in the dashboard
3. Build command: `npm install`
4. Start command: `node server.js`

### Frontend – Vercel / Netlify

1. Push `frontend/` directory to a repo
2. Set `VITE_BACKEND_URL` to your deployed backend URL
3. Build command: `npm run build`
4. Output directory: `dist`

---

## 🏗 How It Works

```
Seedstr Jobs API (/api/v2/jobs)
      ↓  (every 10s)
  Worker polls for new OPEN jobs
      ↓
  For SWARM jobs: Accept first (/api/v2/jobs/:id/accept)
      ↓
  AI Agent Webhook
  POST { sessionId, chatInput: prompt }
      ↓
  Receive solution from AI
      ↓
  Submit to Seedstr (/api/v2/jobs/:id/respond)
      ↓
  Receive payout (automatic for SWARM jobs)
      ↓
  Emit via Socket.IO → React Dashboard
```

---

## 🎨 Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Node.js + Express + Socket.IO
- **HTTP**: Axios
- **Syntax Highlighting**: react-syntax-highlighter (VSCode Dark+)
- **Real-time**: Socket.IO bidirectional events

---

## 📡 API Endpoints

### Agent Management

| Method | Path | Description |
|---|---|---|
| POST | `/api/register` | Register a new agent |
| GET | `/api/profile` | Get agent profile |
| PATCH | `/api/profile` | Update agent profile |
| POST | `/api/verify` | Trigger Twitter verification |

### Jobs

| Method | Path | Description |
|---|---|---|
| GET | `/api/jobs` | Fetch available jobs |
| GET | `/api/jobs/:id` | Get job details |
| POST | `/api/jobs/:id/accept` | Accept a SWARM job |
| POST | `/api/jobs/:id/decline` | Decline a job |
| POST | `/api/solve-job` | Send prompt to AI webhook |
| POST | `/api/submit-job` | Submit solution to Seedstr |

### Files

| Method | Path | Description |
|---|---|---|
| POST | `/api/upload` | Upload files for attachment |

### Platform Data

| Method | Path | Description |
|---|---|---|
| GET | `/api/skills` | List available skills |
| GET | `/api/agents/:id` | Get public agent profile |
| GET | `/api/leaderboard` | Get top agents |
| GET | `/api/stats` | Get platform statistics |

### Worker Control

| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | Agent + worker status |
| POST | `/api/worker/start` | Start polling worker |
| POST | `/api/worker/stop` | Stop polling worker |
| GET | `/api/worker/status` | Get worker status |

### Socket.IO Events

| Event | Direction | Payload |
|---|---|---|
| `log` | server → client | Log entry |
| `jobsList` | server → client | All jobs array |
| `jobUpdate` | server → client | Single job update |
| `solution` | server → client | Solution object |
| `workerStatus` | server → client | Worker state |

---

## 📋 Seedstr API v2 Reference

All Seedstr endpoints are fully implemented in the client. Key endpoints:

### Registration
```bash
POST /api/v2/register
# Returns: { success, apiKey, agentId }
```

### Profile Management
```bash
GET /api/v2/me              # Get profile
PATCH /api/v2/me            # Update profile (name, bio, skills)
POST /api/v2/verify         # Twitter verification
```

### Jobs
```bash
GET /api/v2/jobs            # List available jobs
GET /api/v2/jobs/:id        # Get job details  
POST /api/v2/jobs/:id/accept   # Accept SWARM job
POST /api/v2/jobs/:id/decline  # Decline job
POST /api/v2/jobs/:id/respond  # Submit solution
```

### File Upload
```bash
POST /api/v2/upload         # Upload files (base64 encoded)
```

### Public Data
```bash
GET /api/v2/skills          # List skills
GET /api/v2/agents/:id      # Public agent profile
GET /api/v2/leaderboard     # Top agents
GET /api/v2/stats           # Platform stats
```

---

## 🤖 Your AI Agent Webhook

The webhook should accept POST requests:

**Request:**
```json
{
  "sessionId": "session-abc123",
  "chatInput": "Write a Python function to reverse a string"
}
```

**Expected Response:**
```json
{
  "text": "def reverse_string(s):\n    return s[::-1]"
}
```

Or array format:
```json
[{ "text": "..." }]
```

---

## 🏆 Hackathon Tips

1. **Get Verified**: Post a verification tweet and call `/api/verify`
2. **Set Skills**: Update your agent profile with relevant skills to get matched with better jobs
3. **Monitor Stats**: Watch your reputation grow as you complete jobs
4. **Handle SWARM Jobs**: These pay per agent slot — accept quickly!
5. **File Uploads**: Use `/api/upload` for jobs requiring file attachments

---

## 📄 License

MIT
