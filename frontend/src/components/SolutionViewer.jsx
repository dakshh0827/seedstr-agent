import { useState, useEffect } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import { format } from "date-fns"

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function cleanResponse(text) {
  if (!text) return ""
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\b(copy|sql)\b\s*\n/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function detectLang(filename = "", code = "") {
  const ext = filename.split(".").pop().toLowerCase()
  const extMap = {
    py: "python", js: "javascript", ts: "typescript",
    jsx: "jsx", tsx: "tsx", html: "html", css: "css",
    json: "json", sql: "sql", sh: "bash", bash: "bash",
    yml: "yaml", yaml: "yaml", md: "markdown", txt: "text",
    r: "r", rb: "ruby", go: "go", java: "java", cpp: "cpp",
    c: "c", cs: "csharp", rs: "rust", kt: "kotlin",
  }
  if (extMap[ext]) return extMap[ext]
  if (/SELECT|FROM|JOIN/i.test(code)) return "sql"
  if (/def |import |class .*:/i.test(code)) return "python"
  if (/function |const |let |=>/i.test(code)) return "javascript"
  return "text"
}

function formatBytes(bytes) {
  if (!bytes) return "?"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Base64 → Uint8Array (works without Node Buffer in browser)
function base64ToUint8Array(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ─────────────────────────────────────────────
// ZIP unpacker — loads JSZip from CDN once
// ─────────────────────────────────────────────

let JSZipPromise = null
function loadJSZip() {
  if (JSZipPromise) return JSZipPromise
  JSZipPromise = new Promise((resolve, reject) => {
    if (window.JSZip) return resolve(window.JSZip)
    const s = document.createElement("script")
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
    s.onload = () => resolve(window.JSZip)
    s.onerror = reject
    document.head.appendChild(s)
  })
  return JSZipPromise
}

async function unpackZip(base64) {
  const JSZip = await loadJSZip()
  const zip = await JSZip.loadAsync(base64ToUint8Array(base64))
  const files = []
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    // Only unpack text-readable files — skip images/compiled binaries
    const ext = name.split(".").pop().toLowerCase()
    const textExts = [
      "py","js","ts","jsx","tsx","html","css","json","sql",
      "sh","bash","yml","yaml","md","txt","r","rb","go",
      "java","cpp","c","cs","rs","kt","csv","toml","ini","cfg","env"
    ]
    if (!textExts.includes(ext)) {
      files.push({ name, content: null, binary: true, size: file._data?.uncompressedSize })
      continue
    }
    try {
      const content = await file.async("string")
      files.push({ name, content, binary: false, lang: detectLang(name, content) })
    } catch {
      files.push({ name, content: null, binary: true })
    }
  }
  // Sort: put main/entry files first, then alphabetical
  files.sort((a, b) => {
    const priority = ["main.py","app.py","index.py","solution.py","index.js","main.js"]
    const ai = priority.findIndex(p => a.name.endsWith(p))
    const bi = priority.findIndex(p => b.name.endsWith(p))
    if (ai !== -1 && bi === -1) return -1
    if (bi !== -1 && ai === -1) return 1
    return a.name.localeCompare(b.name)
  })
  return files
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function CopyBtn({ text, small }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      style={{
        padding: small ? "2px 8px" : "4px 10px",
        fontSize: "10px",
        background: "var(--bg-subtle, rgba(255,255,255,0.06))",
        border: "1px solid var(--border, rgba(255,255,255,0.1))",
        borderRadius: "3px",
        color: copied ? "#4ade80" : "var(--text-3, #888)",
        cursor: "pointer",
        fontFamily: "var(--mono, monospace)",
      }}
    >
      {copied ? "✓ copied" : "copy"}
    </button>
  )
}

const syntaxTheme = {
  ...oneDark,
  "pre[class*='language-']": {
    ...oneDark["pre[class*='language-']"],
    background: "#0c0c0d",
    margin: 0,
    fontSize: "11.5px",
  },
  "code[class*='language-']": {
    ...oneDark["code[class*='language-']"],
    background: "transparent",
  },
}

function FileTab({ file, active, onClick }) {
  const ext = file.name.split(".").pop()
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        fontSize: "11px",
        fontFamily: "var(--mono, monospace)",
        background: active ? "var(--bg-overlay, #161618)" : "transparent",
        border: "none",
        borderBottom: active ? "2px solid #f59e0b" : "2px solid transparent",
        color: active ? "var(--text-1, #f0f0f2)" : "var(--text-3, #4a4a52)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        maxWidth: "180px",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={file.name}
    >
      {file.name.split("/").pop()}
    </button>
  )
}

function ZipViewer({ fileBase64, fileName, fileSize }) {
  const [files, setFiles]       = useState(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    unpackZip(fileBase64)
      .then(f => { setFiles(f); setActiveIdx(0); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [fileBase64])

  if (loading) return (
    <div style={{ padding: "24px", textAlign: "center" }}>
      <div style={{ fontSize: "11px", color: "var(--text-3, #4a4a52)", fontFamily: "var(--mono)" }}>
        Unpacking ZIP...
      </div>
    </div>
  )

  if (error) return (
    <div style={{ padding: "14px", color: "#f87171", fontSize: "11px", fontFamily: "var(--mono)" }}>
      Failed to unpack ZIP: {error}
    </div>
  )

  if (!files?.length) return (
    <div style={{ padding: "14px", color: "var(--text-3)", fontSize: "11px", fontFamily: "var(--mono)" }}>
      ZIP is empty or contains no readable files.
    </div>
  )

  const active = files[activeIdx]

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ZIP summary bar */}
      <div style={{
        padding: "6px 14px",
        borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        background: "var(--bg, #0c0c0d)",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: "10px", fontFamily: "var(--mono)", fontWeight: 600,
          color: "#f59e0b",
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.2)",
          borderRadius: "3px",
          padding: "2px 7px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>ZIP</span>
        <span style={{ fontSize: "11px", color: "var(--text-2, #8b8b96)", fontFamily: "var(--mono)" }}>
          {fileName}
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-3, #4a4a52)", fontFamily: "var(--mono)" }}>
          {formatBytes(fileSize)} · {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
        <div style={{ flex: 1 }} />
        {/* Download all as original base64 */}
        <button
          onClick={() => {
            const bytes = base64ToUint8Array(fileBase64)
            const blob = new Blob([bytes], { type: "application/zip" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url; a.download = fileName; a.click()
            URL.revokeObjectURL(url)
          }}
          style={{
            fontSize: "10px", fontFamily: "var(--mono)",
            padding: "3px 10px",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: "3px",
            color: "#f59e0b",
            cursor: "pointer",
          }}
        >
          download ZIP
        </button>
      </div>

      {/* File tabs */}
      <div style={{
        display: "flex",
        overflowX: "auto",
        borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))",
        background: "var(--bg-raised, #111113)",
        flexShrink: 0,
      }}>
        {files.map((f, i) => (
          <FileTab key={f.name} file={f} active={activeIdx === i} onClick={() => setActiveIdx(i)} />
        ))}
      </div>

      {/* File content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {active.binary ? (
          <div style={{
            padding: "20px 14px",
            fontSize: "11px",
            color: "var(--text-3)",
            fontFamily: "var(--mono)",
            textAlign: "center",
          }}>
            Binary file — not displayable
            {active.size && <span style={{ marginLeft: "8px" }}>({formatBytes(active.size)})</span>}
          </div>
        ) : (
          <div>
            {/* File header with path + copy */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "5px 10px",
              background: "var(--bg-subtle, rgba(255,255,255,0.04))",
              borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))",
            }}>
              <span style={{ fontSize: "10px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                {active.name}
              </span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ fontSize: "10px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                  {active.lang}
                </span>
                <CopyBtn text={active.content} small />
              </div>
            </div>
            <SyntaxHighlighter
              language={active.lang}
              style={syntaxTheme}
              wrapLongLines
              showLineNumbers
              lineNumberStyle={{ color: "#3a3a42", fontSize: "10px", minWidth: "36px" }}
            >
              {active.content}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </div>
  )
}

// Text solution parser (unchanged from original)
function parseSolution(text) {
  if (!text) return []
  const parts = []
  const re = /```(\w+)?\n?([\s\S]*?)```/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const prose = text.slice(last, m.index).trim()
      if (prose) parts.push({ type: "prose", content: prose })
    }
    parts.push({ type: "code", lang: m[1] || "text", content: m[2].trim() })
    last = m.index + m[0].length
  }
  const rest = text.slice(last).trim()
  if (rest) parts.push({ type: "prose", content: rest })
  return parts
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function SolutionViewer({ solution }) {
  const isZip = solution?.isZip && solution?.fileBase64

  const textContent = !isZip && solution
    ? cleanResponse(
        typeof solution.solution === "string"
          ? solution.solution
          : JSON.stringify(solution.solution || "", null, 2)
      )
    : null

  const parts = textContent ? parseSolution(textContent) : []

  return (
    <div className="panel" style={{ overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div className="panel-header">
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span className="label">Solution</span>
          {solution && (
            <span className={`badge ${isZip ? "badge-pending" : "badge-done"}`}>
              {isZip ? "ZIP" : "Text"}
            </span>
          )}
          {solution?.jobId && (
            <span style={{ fontSize: "10px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>
              {solution.jobId}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {solution?.timestamp && (
            <span style={{ fontSize: "10px", color: "var(--text-3)" }}>
              {format(new Date(solution.timestamp), "HH:mm:ss")}
            </span>
          )}
          {textContent && <CopyBtn text={textContent} />}
        </div>
      </div>

      {/* Prompt bar */}
      {solution?.prompt && (
        <div style={{
          padding: "8px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          flexShrink: 0,
        }}>
          <div className="label" style={{ marginBottom: "4px" }}>Prompt</div>
          <div style={{ fontSize: "11px", color: "var(--text-2)", lineHeight: "1.5" }}>
            {solution.prompt.length > 180
              ? solution.prompt.slice(0, 180) + "…"
              : solution.prompt}
          </div>
        </div>
      )}

      {/* Content area */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {!solution ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>Solutions appear here</span>
          </div>
        ) : isZip ? (
          <ZipViewer
            fileBase64={solution.fileBase64}
            fileName={solution.fileName || "solution.zip"}
            fileSize={solution.fileSize}
          />
        ) : (
          <div style={{ overflowY: "auto", flex: 1, padding: "14px" }}>
            {parts.map((part, i) => (
              part.type === "prose" ? (
                <p key={i} style={{
                  fontSize: "12px", lineHeight: "1.7",
                  marginBottom: "12px", whiteSpace: "pre-wrap",
                  color: "var(--text-2)",
                }}>
                  {part.content}
                </p>
              ) : (
                <div key={i} style={{
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  overflow: "hidden",
                  marginBottom: "12px",
                }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "5px 10px",
                    background: "var(--bg-subtle)",
                  }}>
                    <span style={{ fontSize: "10px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
                      {part.lang}
                    </span>
                    <CopyBtn text={part.content} small />
                  </div>
                  <SyntaxHighlighter language={part.lang} style={syntaxTheme} wrapLongLines>
                    {part.content}
                  </SyntaxHighlighter>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  )
}