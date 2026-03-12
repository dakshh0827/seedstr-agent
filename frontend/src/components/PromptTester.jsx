import { useState } from 'react'

const EXAMPLES = [
  'Reverse a linked list in Python, O(n) time.',
  'React hook for debounced input with TypeScript.',
  'SQL query: top 5 customers by total revenue.',
  'Dockerfile for a Node.js app with multi-stage build.',
  'Binary search implementation in Go.',
]

export default function PromptTester({ onSubmit }) {
  const [prompt,  setPrompt]  = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)

  const run = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await onSubmit(prompt.trim())
      setResult(data.solution || JSON.stringify(data))
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel" style={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header" style={{ flexShrink: 0 }}>
        <span className="label">Manual Test</span>
        <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>⌘↵ to run</span>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflow: 'hidden' }}>
        {/* Textarea — flex: 1 fills space */}
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run() }}
          placeholder="Enter a coding prompt..."
          style={{ width: '100%', flex: 1, minHeight: '80px', resize: 'none' }}
        />

        {/* Run button */}
        <button
          onClick={run}
          disabled={!prompt.trim() || loading}
          className={`btn ${!prompt.trim() || loading ? '' : 'btn-primary'}`}
          style={{ width: '100%', justifyContent: 'center', padding: '7px', flexShrink: 0 }}
        >
          {loading ? (
            <>
              <div className="spin" style={{
                width: '10px', height: '10px', borderRadius: '50%',
                border: '1.5px solid var(--amber)', borderTopColor: 'transparent',
              }} />
              Running…
            </>
          ) : <>▶ Run Agent</>}
        </button>

        {/* Result preview */}
        {(result || error) && (
          <div style={{
            padding: '8px 10px', background: 'var(--bg)', flexShrink: 0,
            border: `1px solid ${error ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.2)'}`,
            borderRadius: '4px', maxHeight: '90px', overflowY: 'auto',
          }}>
            <div className="label" style={{ marginBottom: '4px', color: error ? '#f87171' : '#4ade80' }}>
              {error ? 'Error' : 'Preview'}
            </div>
            <p style={{
              fontSize: '10px', fontFamily: 'var(--mono)', margin: 0,
              color: error ? '#f87171' : 'var(--text-2)',
              lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {(error || result)?.slice(0, 240)}{(error || result)?.length > 240 ? '…' : ''}
            </p>
          </div>
        )}

        {/* Examples */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', flexShrink: 0 }}>
          <div className="label" style={{ marginBottom: '6px' }}>Examples</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => { setPrompt(ex); setResult(null); setError(null) }}
                style={{
                  textAlign: 'left', background: 'none',
                  border: '1px solid var(--border)', borderRadius: '3px',
                  padding: '5px 8px', fontSize: '10px', color: 'var(--text-3)',
                  fontFamily: 'var(--mono)', cursor: 'pointer',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => { e.target.style.color = 'var(--text-2)'; e.target.style.borderColor = 'var(--border-mid)' }}
                onMouseLeave={e => { e.target.style.color = 'var(--text-3)'; e.target.style.borderColor = 'var(--border)' }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}