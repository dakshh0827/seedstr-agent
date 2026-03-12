import { useState, useEffect, useCallback } from 'react'
import { io } from 'socket.io-client'
import axios from 'axios'
import Dashboard from './pages/Dashboard.jsx'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

// Establish socket connection once at the app level
const socket = io(BACKEND_URL, { reconnectionDelay: 1000 })

export default function App() {
  const [connected, setConnected]       = useState(false)
  const [agentStatus, setAgentStatus]   = useState(null)
  const [workerStatus, setWorkerStatus] = useState(null)
  const [jobs, setJobs]                 = useState([])
  const [logs, setLogs]                 = useState([])
  const [latestSolution, setLatestSolution] = useState(null)
  const [platformStats, setPlatformStats] = useState(null)
  const [skills, setSkills]             = useState([])

  // ── Socket listeners ──
  useEffect(() => {
    socket.on('connect', () => {
      setConnected(true)
      fetchStatus()
      fetchPlatformData()
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('log', (entry) => {
      setLogs(prev => [entry, ...prev].slice(0, 200)) // keep last 200
    })

    socket.on('jobUpdate', (job) => {
      setJobs(prev => {
        const idx = prev.findIndex(j => j.id === job.id)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = job
          return updated
        }
        return [job, ...prev]
      })
    })

    socket.on('jobsList', (list) => {
      setJobs(list)
    })

    socket.on('solution', (sol) => {
      if (typeof sol === "string") {
        setLatestSolution({ solution: sol })
      } else if (sol?.solution) {
        setLatestSolution(sol)
      } else {
        setLatestSolution({ solution: JSON.stringify(sol, null, 2) })
      }
    })

    socket.on('workerStatus', (status) => {
      setWorkerStatus(status)
    })

    return () => socket.removeAllListeners()
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/status`)
      setAgentStatus(res.data)
      setWorkerStatus(res.data.workerStatus)
    } catch (_) {}
  }, [])

  const fetchPlatformData = useCallback(async () => {
    try {
      const [statsRes, skillsRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/stats`).catch(() => ({ data: {} })),
        axios.get(`${BACKEND_URL}/api/skills`).catch(() => ({ data: {} })),
      ])
      if (statsRes.data?.stats) setPlatformStats(statsRes.data.stats)
      if (skillsRes.data?.skills) setSkills(skillsRes.data.skills)
    } catch (_) {}
  }, [])

  // ── Worker controls ──
  const toggleWorker = useCallback(async () => {
    const endpoint = workerStatus?.running ? '/api/worker/stop' : '/api/worker/start'
    await axios.post(`${BACKEND_URL}${endpoint}`)
    fetchStatus()
  }, [workerStatus, fetchStatus])

  // ── Manual prompt test ──
  const testPrompt = useCallback(async (prompt) => {
    const res = await axios.post(`${BACKEND_URL}/api/solve-job`, {
      prompt,
      sessionId: `manual-${Date.now()}`,
    })
    return res.data
  }, [])

  // ── Update agent profile ──
  const updateProfile = useCallback(async (profileData) => {
    const res = await axios.patch(`${BACKEND_URL}/api/profile`, profileData)
    if (res.data.success) {
      fetchStatus() // Refresh profile
    }
    return res.data
  }, [fetchStatus])

  // ── Trigger verification ──
  const triggerVerify = useCallback(async () => {
    const res = await axios.post(`${BACKEND_URL}/api/verify`)
    if (res.data.success) {
      fetchStatus() // Refresh profile
    }
    return res.data
  }, [fetchStatus])

  return (
    <Dashboard
      connected={connected}
      agentStatus={agentStatus}
      workerStatus={workerStatus}
      jobs={jobs}
      logs={logs}
      latestSolution={latestSolution}
      platformStats={platformStats}
      skills={skills}
      onToggleWorker={toggleWorker}
      onTestPrompt={testPrompt}
      onUpdateProfile={updateProfile}
      onVerify={triggerVerify}
      backendUrl={BACKEND_URL}
    />
  )
}
