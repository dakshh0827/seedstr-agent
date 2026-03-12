import { useState } from 'react'

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

export default function AgentStatus({ connected, agentStatus, workerStatus, onUpdateProfile, onVerify }) {
  const profile = agentStatus?.agentProfile;
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async () => {
    if (!onVerify) return;
    setVerifying(true);
    try {
      await onVerify();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="panel" style={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <span className="label">Agent Profile</span>
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
      <div style={{ padding: '0 14px', flex: 1, overflowY: 'auto' }}>
        <Row label="Name" value={profile?.name || 'Unnamed Agent'} />
        {profile?.id && (
          <Row label="Agent ID" value={profile.id.slice(0, 12) + '...'} color="var(--text-3)" />
        )}
        {profile?.verification?.isVerified ? (
          <Row label="Verified" value={`✓ ${profile?.verification?.ownerTwitter || 'Verified'}`} color="var(--blue)" />
        ) : (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 0', borderBottom: '1px solid var(--border)',
          }}>
            <span className="label">Verified</span>
            <button 
              onClick={handleVerify}
              disabled={verifying}
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                color: 'var(--amber)',
                cursor: verifying ? 'wait' : 'pointer',
              }}
            >
              {verifying ? 'Checking...' : 'Verify'}
            </button>
          </div>
        )}
        <Row label="Reputation" value={profile?.reputation ?? 0} color="var(--amber)" />
        <Row label="Earnings" value={`$${profile?.totalEarnings ?? 0}`} color="var(--green)" />
        <Row label="Jobs Done" value={profile?.jobsCompleted ?? 0} />
        <Row label="Jobs Declined" value={profile?.jobsDeclined ?? 0} color={profile?.jobsDeclined ? 'var(--red)' : 'var(--text-3)'} />
        <Row label="Global Rank" value={profile?.rank ? `#${profile.rank}` : '—'} />
        
        {profile?.walletAddress && (
          <Row 
            label={profile?.walletType || 'Wallet'} 
            value={profile.walletAddress.slice(0, 6) + '...' + profile.walletAddress.slice(-4)} 
            color="var(--text-3)" 
          />
        )}
        
        <div style={{ margin: '8px 0', height: '1px', background: 'var(--border)' }} />

        <Row label="Worker"    value={workerStatus?.running ? 'Polling' : 'Idle'}
             color={workerStatus?.running ? 'var(--amber)' : 'var(--text-3)'} />
        <Row label="Solved"    value={workerStatus?.successCount ?? 0} color="var(--green)" />
        <Row label="Failures"  value={workerStatus?.failureCount ?? 0}
             color={workerStatus?.failureCount ? 'var(--red)' : 'var(--text-3)'} />
        <Row label="Processed" value={workerStatus?.processedJobCount ?? 0} />
      </div>

      {/* API Status — pinned to bottom */}
      <div style={{
        margin: '12px 14px 14px',
        padding: '8px 10px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        flexShrink: 0,
      }}>
        <div className="label" style={{ marginBottom: '4px' }}>
          {agentStatus?.configured ? 'API Connected' : 'API Not Configured'}
        </div>
        <div style={{
          fontSize: '10px', 
          color: agentStatus?.configured ? 'var(--green)' : 'var(--red)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'var(--mono)',
        }} title={agentStatus?.webhookUrl}>
          {agentStatus?.webhookUrl?.replace('http://', '').replace('https://', '').slice(0, 40)}...
        </div>
      </div>
    </div>
  )
}