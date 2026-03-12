import AgentStatus from '../components/AgentStatus.jsx'
import JobFeed from '../components/JobFeed.jsx'
import SolutionViewer from '../components/SolutionViewer.jsx'
import LogsPanel from '../components/LogsPanel.jsx'
import PromptTester from '../components/PromptTester.jsx'

export default function Dashboard({
  connected, agentStatus, workerStatus, jobs, logs, latestSolution,
  platformStats, skills,
  onToggleWorker, onTestPrompt, onUpdateProfile, onVerify,
}) {
  const running = workerStatus?.running

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Topbar ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(12,12,13,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        height: '44px',
        display: 'flex', alignItems: 'center',
        padding: '0 20px',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="6" height="6" rx="1" fill="var(--amber)" opacity="0.9"/>
            <rect x="9" y="1" width="6" height="6" rx="1" fill="var(--amber)" opacity="0.4"/>
            <rect x="1" y="9" width="6" height="6" rx="1" fill="var(--amber)" opacity="0.4"/>
            <rect x="9" y="9" width="6" height="6" rx="1" fill="var(--amber)" opacity="0.15"/>
          </svg>
          <span style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '13px', letterSpacing: '0.02em' }}>
            seedstr<span style={{ color: 'var(--amber)' }}>/agent</span>
          </span>
        </div>

        <div style={{ width: '1px', height: '16px', background: 'var(--border-mid)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div className={connected ? 'dot-live' : ''} style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: connected ? 'var(--green)' : 'var(--text-3)',
            boxShadow: connected ? '0 0 6px var(--green)' : 'none',
          }} />
          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
            {connected ? 'connected' : 'disconnected'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
          <div className={running ? 'dot-live' : ''} style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: running ? 'var(--amber)' : 'var(--text-3)',
          }} />
          <span style={{ fontSize: '11px', color: running ? 'var(--amber)' : 'var(--text-3)' }}>
            worker {running ? 'polling' : 'idle'}
          </span>
        </div>
        {workerStatus?.currentJobId && (
          <span style={{
            fontSize: '11px',
            color: 'var(--amber)',
            fontFamily: 'var(--mono)'
          }}>
            solving {workerStatus.currentJobId}
          </span>
        )}

        {workerStatus && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: '4px' }}>
            <div style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
            <Stat label="solved" value={workerStatus.successCount ?? 0} color="var(--green)" />
            <Stat label="failed" value={workerStatus.failureCount ?? 0} color={workerStatus.failureCount ? 'var(--red)' : 'var(--text-3)'} />
            <Stat label="queued" value={jobs.filter(j => j.status === 'pending').length} />
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button onClick={onToggleWorker} className={running ? 'btn btn-danger' : 'btn btn-primary'}>
          {running ? <><PauseIcon /> Stop Worker</> : <><PlayIcon /> Start Worker</>}
        </button>
      </header>

      {/* ── Main grid ── */}
      <main style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Row 1 — metrics bar */}
        <MetricsBar workerStatus={workerStatus} jobs={jobs} platformStats={platformStats} />

        {/* Row 2 — AgentStatus | JobFeed | LogsPanel — all same height */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr 360px',   /* wider status + logs, narrower jobs */
          gap: '12px',
          alignItems: 'stretch',                     /* KEY: all columns same height */
        }}>
          <AgentStatus 
            connected={connected} 
            agentStatus={agentStatus} 
            workerStatus={workerStatus}
            onUpdateProfile={onUpdateProfile}
            onVerify={onVerify}
          />
          <JobFeed jobs={jobs} />
          <LogsPanel logs={logs} />
        </div>

        {/* Row 3 — SolutionViewer | PromptTester — same height */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 360px',          /* matches logs column width */
          gap: '12px',
          alignItems: 'stretch',                     /* KEY: both same height */
        }}>
          <SolutionViewer solution={latestSolution} />
          <PromptTester onSubmit={onTestPrompt} />
        </div>

      </main>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: color || 'var(--text-2)', fontFamily: 'var(--mono)' }}>
        {value}
      </span>
      <span style={{ fontSize: '10px', color: 'var(--text-3)', letterSpacing: '0.04em' }}>{label}</span>
    </div>
  )
}

function MetricsBar({ workerStatus, jobs, platformStats }) {
  const metrics = [
    { label: 'Total Jobs',    value: jobs.length },
    { label: 'Solved',        value: workerStatus?.successCount ?? 0,     color: 'var(--green)' },
    { label: 'Failed',        value: workerStatus?.failureCount ?? 0,     color: workerStatus?.failureCount ? 'var(--red)' : undefined },
    { label: 'Pending',       value: jobs.filter(j => j.status === 'pending' || j.status === 'OPEN').length, color: 'var(--amber)' },
    { label: 'Platform Jobs', value: platformStats?.totalJobs ?? '—' },
    { label: 'Open Jobs',     value: platformStats?.openJobs ?? '—', color: 'var(--blue)' },
  ]

  return (
    <div className="panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)' }}>
      {metrics.map((m, i) => (
        <div key={i} style={{
          padding: '12px 16px',
          borderRight: i < metrics.length - 1 ? '1px solid var(--border)' : 'none',
        }}>
          <div className="label" style={{ marginBottom: '6px' }}>{m.label}</div>
          <div style={{
            fontSize: '20px', fontWeight: 600,
            fontFamily: 'var(--mono)',
            color: m.color || 'var(--text-1)',
            letterSpacing: '-0.02em',
          }}>
            {m.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (secs < 5)  return 'just now'
  if (secs < 60) return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ago`
}

function PlayIcon() {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1.5l6 3.5-6 3.5V1.5z"/></svg>
}
function PauseIcon() {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="2" y="1.5" width="2.5" height="7"/><rect x="5.5" y="1.5" width="2.5" height="7"/></svg>
}