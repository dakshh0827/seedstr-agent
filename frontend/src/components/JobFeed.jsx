import { useState } from 'react'

const STATUS = {
  OPEN: { cls: 'badge-pending', label: 'Open' },
  pending: { cls: 'badge-pending', label: 'Pending' },
  processing: { cls: 'badge-solving', label: 'Solving' },
  completed: { cls: 'badge-done', label: 'Done' },
  submitted: { cls: 'badge-done', label: 'Done' },
  success: { cls: 'badge-done', label: 'Done' },
  failed: { cls: 'badge-failed', label: 'Failed' },
  submit_failed: { cls: 'badge-failed', label: 'Submit Error' },
}

function timeAgo(iso) {
  if (!iso) return ''
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`
  return `${Math.floor(secs/3600)}h ago`
}

function JobRow({ job, selected, onClick }) {
  const s = STATUS[job.status] || STATUS.pending
  const isActive = job.status === 'processing'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 14px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: selected ? 'var(--bg-subtle)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div>
        <div style={{
          fontSize: '11px', color: 'var(--text-2)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {job.prompt}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '2px', fontFamily: 'var(--mono)' }}>
          {job.id} · {timeAgo(job.createdAt)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
        {job.jobType === 'SWARM' && (
           <span style={{ fontSize: '9px', fontWeight: 600, color: '#a78bfa', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
             SWARM
           </span>
        )}
        {job.difficulty && (
          <span style={{
            fontSize: '9px', fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: job.difficulty === 'hard' ? 'var(--red)' : job.difficulty === 'medium' ? 'var(--amber)' : 'var(--green)',
            fontFamily: 'var(--mono)',
          }}>
            {job.difficulty}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        {isActive && <div className="dot-live" style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#60a5fa' }} />}
        <span className={`badge ${s.cls}`}>{s.label}</span>
      </div>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div className="skel" style={{ height: '10px', width: '65%' }} />
      <div className="skel" style={{ height: '9px', width: '35%' }} />
    </div>
  )
}

export default function JobFeed({ jobs }) {
  const [selected, setSelected] = useState(null)
  const selectedJob = jobs.find(j => j.id === selected)

  return (
    <div className="panel" style={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="panel-header" style={{ flexShrink: 0 }}>
        <span className="label">Jobs</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {jobs.some(j => j.status === 'processing') && (
            <div className="dot-live" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#60a5fa' }} />
          )}
          <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
            {jobs.length} total
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto auto',
        gap: '10px', padding: '5px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        flexShrink: 0,
      }}>
        <span className="label">Prompt</span>
        <span className="label">Type/Level</span>
        <span className="label">Status</span>
      </div>

      {/* Scrollable rows — flex: 1 fills remaining height */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {jobs.length === 0 ? (
          <>
            <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
            <div style={{ padding: '12px 14px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>Waiting for jobs…</span>
            </div>
          </>
        ) : (
          jobs.map(job => (
            <JobRow
              key={job.id}
              job={job}
              selected={selected === job.id}
              onClick={() => setSelected(selected === job.id ? null : job.id)}
            />
          ))
        )}
      </div>

      {/* Selected job detail — pinned to bottom */}
      {selectedJob && (
        <div style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg)',
          flexShrink: 0,
        }}>
          <div className="label" style={{ marginBottom: '6px' }}>Full Prompt</div>
          <p style={{ fontSize: '11px', color: 'var(--text-2)', lineHeight: '1.6', margin: 0 }}>
            {selectedJob.prompt}
          </p>
        </div>
      )}
    </div>
  )
}