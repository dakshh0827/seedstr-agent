# 🤖 Seedstr Agent Dashboard

A full-stack AI agent dashboard that automatically polls Seedstr jobs, solves them with your coding agent webhook, and submits solutions — all visualized in a real-time hacker-aesthetic UI.

---

## Project Structure

```
seedstr-agent/
├── backend/
│   ├── server.js          # Express + Socket.IO server
│   ├── seedstrClient.js   # Seedstr API + webhook HTTP client
│   ├── worker.js          # Auto-polling job worker
│   ├── package.json
│   └── .env               # Backend environment variables
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentStatus.jsx    # Status panel
│   │   │   ├── JobFeed.jsx        # Live job list
│   │   │   ├── SolutionViewer.jsx # Code display with syntax highlighting
│   │   │   ├── LogsPanel.jsx      # Activity log
│   │   │   └── PromptTester.jsx   # Manual webhook tester
│   │   ├── pages/
│   │   │   └── Dashboard.jsx      # Main layout
│   │   ├── App.jsx                # Root + socket connection
│   │   ├── main.jsx
│   │   └── index.css             # Tailwind v4 + custom styles
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env                       # Frontend environment variables
│
└── README.md
```

---

## ⚡ Quick Start (Local)

### 1. Backend setup

```bash
cd backend
npm install
```

Edit `.env`:
```env
SEEDSTR_API_KEY=your_key_here
SEEDSTR_BASE_URL=https://api.seedstr.io
AGENT_WEBHOOK_URL=https://ai-agent1-lvh9.onrender.com/webhook/713b4a9e-0c1f-4814-addf-e3e379f4c1d9
MOCK_SEEDSTR=true        # set to false when you have a real API key
FRONTEND_URL=http://localhost:5173
PORT=3001
```

Start the backend:
```bash
npm run dev       # development (auto-reload)
npm start         # production
```

### 2. Frontend setup

```bash
cd frontend
npm install
```

Edit `.env`:
```env
VITE_BACKEND_URL=http://localhost:3001
```

Start the frontend:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## 🔧 Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Description | Default |
|---|---|---|
| `SEEDSTR_API_KEY` | Your Seedstr API key | — |
| `SEEDSTR_BASE_URL` | Seedstr API base URL | `https://api.seedstr.io` |
| `AGENT_WEBHOOK_URL` | AI agent webhook endpoint | pre-configured |
| `MOCK_SEEDSTR` | Use mock jobs (demo mode) | `true` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `PORT` | Server port | `3001` |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_BACKEND_URL` | Backend server URL |

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
Seedstr Jobs API
      ↓  (every 10s)
  Worker polls for new jobs
      ↓
  AI Agent Webhook
  POST { sessionId, chatInput: prompt }
      ↓
  Receive solution
      ↓
  Submit to Seedstr
      ↓
  Emit via Socket.IO → React Dashboard
```

---

## 🎨 Tech Stack

- **Frontend**: React 18 + Vite + TailwindCSS v4
- **Backend**: Node.js + Express + Socket.IO
- **HTTP**: Axios
- **Syntax Highlighting**: react-syntax-highlighter (VSCode Dark+)
- **Real-time**: Socket.IO bidirectional events

---

## 📡 API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | Agent + worker status |
| GET | `/api/jobs` | Fetch jobs from Seedstr |
| POST | `/api/solve-job` | Send prompt to webhook |
| POST | `/api/submit-job` | Submit solution to Seedstr |
| POST | `/api/worker/start` | Start polling worker |
| POST | `/api/worker/stop` | Stop polling worker |

### Socket.IO Events

| Event | Direction | Payload |
|---|---|---|
| `log` | server → client | Log entry |
| `jobsList` | server → client | All jobs array |
| `jobUpdate` | server → client | Single job update |
| `solution` | server → client | Solution object |
| `workerStatus` | server → client | Worker state |
