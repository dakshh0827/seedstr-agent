import { useRef, useEffect } from 'react'
import { format } from 'date-fns'

const LOG_CFG = {
  info:    { color: 'var(--text-3)',  tag: 'INF' },
  success: { color: '#4ade80',        tag: 'OK ' },
  error:   { color: '#f87171',        tag: 'ERR' },
  warn:    { color: 'var(--amber)',   tag: 'WRN' },
  poll:    { color: '#60a5fa',        tag: 'POL' },
}

function LogLine({ entry }) {
  const cfg = LOG_CFG[entry.type] || LOG_CFG.info
  const time = entry.timestamp ? format(new Date(entry.timestamp), 'HH:mm:ss') : ''

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '52px 28px 1fr',
      gap: '8px',
      padding: '3px 0',
      borderBottom: '1px solid var(--border)',
      alignItems: 'start',
    }}>
      <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)', paddingTop: '1px' }}>
        {time}
      </span>
      <span style={{ fontSize: '10px', fontWeight: 600, color: cfg.color, fontFamily: 'var(--mono)', paddingTop: '1px' }}>
        {cfg.tag}
      </span>
      <span style={{
        fontSize: '11px',
        color: cfg.color === 'var(--text-3)' ? 'var(--text-2)' : cfg.color,
        lineHeight: '1.5', wordBreak: 'break-all', fontFamily: 'var(--mono)',
      }}>
        {entry.message}
      </span>
    </div>
  )
}

export default function LogsPanel({ logs }) {
  const bottomRef   = useRef(null)
  const containerRef = useRef(null)
  const pinned      = useRef(true)

  const onScroll = () => {
    const el = containerRef.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30
  }

  useEffect(() => {
    if (pinned.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="panel" style={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="panel-header" style={{ flexShrink: 0 }}>
        <span className="label">Activity Log</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {logs.length > 0 && (
            <div className="dot-live" style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--amber)' }} />
          )}
          <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
            {logs.length}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: '10px', padding: '5px 14px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        {Object.entries(LOG_CFG).map(([type, cfg]) => (
          <span key={type} style={{ fontSize: '9px', color: cfg.color, fontFamily: 'var(--mono)', fontWeight: 600 }}>
            {cfg.tag}
          </span>
        ))}
      </div>

      {/* Log lines — flex: 1 fills remaining height */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        style={{ padding: '6px 14px', overflowY: 'auto', flex: 1 }}
      >
        {logs.length === 0 ? (
          <div style={{ padding: '12px 0', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>No events yet…</span>
          </div>
        ) : (
          [...logs].slice(0, 10).reverse().map(e => <LogLine key={e.id} entry={e} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}