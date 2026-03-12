function Row({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span className="label">{label}</span>
      <span style={{
        fontSize: '11px', fontWeight: 500,
        color: color || 'var(--text-2)',
        fontFamily: 'var(--mono)',
        maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={typeof value === 'string' ? value : undefined}>
        {value ?? '—'}
      </span>
    </div>
  )
}

export default function AgentStatus({ connected, agentStatus, workerStatus }) {
  return (
    <div className="panel" style={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <span className="label">Agent</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div className={connected ? 'dot-live' : ''} style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: connected ? 'var(--green)' : 'var(--red)',
          }} />
          <span style={{ fontSize: '11px', color: connected ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
            {connected ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Stats rows — flex-grow fills space */}
      <div style={{ padding: '0 14px', flex: 1 }}>
        <Row label="Worker"    value={workerStatus?.running ? 'Polling' : 'Idle'}
             color={workerStatus?.running ? 'var(--amber)' : 'var(--text-3)'} />
        <Row label="Solved"    value={workerStatus?.successCount ?? 0} color="var(--green)" />
        <Row label="Failures"  value={workerStatus?.failureCount ?? 0}
             color={workerStatus?.failureCount ? 'var(--red)' : 'var(--text-3)'} />
        <Row label="Processed" value={workerStatus?.processedJobCount ?? 0} />
        <Row label="Poll every" value={`${(workerStatus?.pollIntervalMs ?? 10000) / 1000}s`} />
        <Row label="Last Poll"  value={workerStatus?.lastPollTime ? timeAgo(workerStatus.lastPollTime) : '—'} />
        {workerStatus?.currentJobId && (
          <Row label="Active Job" value={workerStatus.currentJobId} color="var(--amber)" />
        )}
      </div>

      {/* Endpoint — pinned to bottom */}
      {agentStatus?.webhookUrl && (
        <div style={{
          margin: '12px 14px 14px',
          padding: '8px 10px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          flexShrink: 0,
        }}>
          <div className="label" style={{ marginBottom: '4px' }}>Endpoint</div>
          <div style={{
            fontSize: '10px', color: 'var(--text-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'var(--mono)',
          }} title={agentStatus.webhookUrl}>
            {agentStatus.webhookUrl.replace('https://', '')}
          </div>
        </div>
      )}
    </div>
  )
}

function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ago`
}