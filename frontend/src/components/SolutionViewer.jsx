import { useState } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import { format } from "date-fns"

function cleanResponse(text) {
  if (!text) return ""

  let cleaned = text

  cleaned = cleaned.replace(/^#{1,6}\s*/gm, "")
  cleaned = cleaned.replace(/\b(copy|sql)\b\s*\n/gi, "")
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n")

  return cleaned.trim()
}

function detectLang(code) {

  if (!code) return "text"

  if (/SELECT|FROM|JOIN/i.test(code)) return "sql"

  if (/def |import |from |class .*:/i.test(code))
    return "python"

  if (/interface |: string|: number|: boolean/i.test(code))
    return "typescript"

  if (/<\/?[a-z][\s\S]*>/i.test(code))
    return "html"

  if (/function |const |let |=>/i.test(code))
    return "javascript"

  return "text"
}

function detectTable(block) {
  const lines = block.trim().split("\n")

  if (lines.length < 2) return false

  const divider = /^\s*\|?[-:\s|]+\|?\s*$/

  return lines.some(line => divider.test(line))
}

function cleanCell(text) {
  if (!text) return ""

  let cleaned = text

  // remove inline code marks
  cleaned = cleaned.replace(/`([^`]*)`/g, "$1")

  // remove bold
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1")

  // remove italics
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1")

  // convert <br> to newline
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n")

  // trim whitespace
  cleaned = cleaned.trim()

  return cleaned
}

function parseTable(block) {

  const rows = block
    .trim()
    .split("\n")
    .filter(line => line.includes("|"))

  if (rows.length < 2) return null

  const header = rows[0]
    .split("|")
    .map(c => cleanCell(c))
    .filter(Boolean)

  const dataRows = rows
    .slice(2)
    .map(row =>
      row
        .split("|")
        .map(c => cleanCell(c))
        .filter(Boolean)
    )

  return { header, rows: dataRows }
}

function parseSolution(text) {

  if (!text) return []

  const parts = []

  const re = /```(\w+)?\n?([\s\S]*?)```/g

  let last = 0
  let m

  while ((m = re.exec(text)) !== null) {

    if (m.index > last) {

      const prose = text.slice(last, m.index).trim()

      if (prose) {

        if (detectTable(prose)) {

          parts.push({
            type: "table",
            table: parseTable(prose)
          })

        } else {

          parts.push({
            type: "prose",
            content: prose
          })

        }

      }

    }

    parts.push({
      type: "code",
      lang: m[1] || detectLang(m[2]),
      content: m[2].trim()
    })

    last = m.index + m[0].length
  }

  const rest = text.slice(last).trim()

  if (rest) {

    if (detectTable(rest)) {

      parts.push({
        type: "table",
        table: parseTable(rest)
      })

    } else {

      const isCode =
        rest.includes("\n") &&
        (rest.includes("{") || /def |function |class /.test(rest))

      parts.push({
        type: isCode ? "code" : "prose",
        lang: detectLang(rest),
        content: rest
      })
    }
  }

  return parts
}

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
      className="btn"
      style={{
        padding: small ? "2px 8px" : "4px 10px",
        fontSize: "10px",
        color: copied ? "var(--green)" : "var(--text-3)"
      }}
    >
      {copied ? "✓ copied" : "copy"}
    </button>
  )
}

const theme = {
  ...oneDark,
  "pre[class*='language-']": {
    ...oneDark["pre[class*='language-']"],
    background: "#0c0c0d",
    margin: 0
  },
  "code[class*='language-']": {
    ...oneDark["code[class*='language-']"],
    background: "transparent"
  }
}

export default function SolutionViewer({ solution }) {

  const text =
    typeof solution?.solution === "string"
      ? solution.solution
      : JSON.stringify(solution?.solution || "", null, 2)

  const cleaned = cleanResponse(text)

  const parts = parseSolution(cleaned)

  return (
    <div
      className="panel"
      style={{
        overflow: "hidden",
        height: "100%",
        display: "flex",
        flexDirection: "column"
      }}
    >

      <div className="panel-header">

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>

          <span className="label">Solution</span>

          {solution && (
            <span className="badge badge-done">Agent Solution</span>
          )}

          {solution?.jobId && (
            <span
              style={{
                fontSize: "10px",
                color: "var(--text-3)",
                fontFamily: "var(--mono)"
              }}
            >
              {solution.jobId}
            </span>
          )}

        </div>

        <div style={{ display: "flex", gap: "8px" }}>

          {solution?.timestamp && (
            <span
              style={{
                fontSize: "10px",
                color: "var(--text-3)"
              }}
            >
              {format(new Date(solution.timestamp), "HH:mm:ss")}
            </span>
          )}

          {solution && (
            <CopyBtn text={cleaned} />
          )}

        </div>

      </div>

      {solution?.prompt && (

        <div
          style={{
            padding: "8px 14px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg)"
          }}
        >

          <div className="label" style={{ marginBottom: "4px" }}>
            Prompt
          </div>

          <div
            style={{
              fontSize: "11px",
              color: "var(--text-2)"
            }}
          >
            {solution.prompt}
          </div>

        </div>

      )}

      <div style={{ overflowY: "auto", flex: 1 }}>

        {!solution ? (

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%"
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
              Solutions appear here
            </span>
          </div>

        ) : (

          <div style={{ padding: "14px" }}>

            {parts.map((part, i) => {

              if (part.type === "prose") {

                return (
                  <p
                    key={i}
                    style={{
                      fontSize: "12px",
                      lineHeight: "1.7",
                      marginBottom: "12px",
                      whiteSpace: "pre-wrap"
                    }}
                  >
                    {part.content}
                  </p>
                )
              }

              if (part.type === "code") {

                return (
                  <div
                    key={i}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      overflow: "hidden",
                      marginBottom: "12px"
                    }}
                  >

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "5px 10px",
                        background: "var(--bg-subtle)"
                      }}
                    >

                      <span
                        style={{
                          fontSize: "10px",
                          fontFamily: "var(--mono)"
                        }}
                      >
                        {part.lang}
                      </span>

                      <CopyBtn text={part.content} small />

                    </div>

                    <SyntaxHighlighter
                      language={part.lang}
                      style={theme}
                      wrapLongLines
                    >
                      {part.content}
                    </SyntaxHighlighter>

                  </div>
                )
              }

              if (part.type === "table" && part.table) {

                return (
                  <div
                    key={i}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      overflow: "hidden",
                      marginBottom: "12px"
                    }}
                  >

                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "11px"
                      }}
                    >

                      <thead style={{ background: "var(--bg-subtle)" }}>
                        <tr>
                          {part.table.header.map((h, idx) => (
                            <th
                              key={idx}
                              style={{
                                padding: "6px 10px",
                                borderBottom: "1px solid var(--border)",
                                textAlign: "left"
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {part.table.rows.map((row, r) => (
                          <tr key={r}>
                            {row.map((cell, c) => (
                              <td
                                key={c}
                                style={{
                                  padding: "6px 10px",
                                  borderBottom: "1px solid var(--border)"
                                }}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>

                    </table>

                  </div>
                )
              }

              return null
            })}

          </div>
        )}

      </div>

    </div>
  )
}