import { useState } from 'react'
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  FlaskConical,
  ShieldCheck,
  X,
} from 'lucide-react'
import { bidPayload, sha256, START } from '../protocol/fixtures'
import { ledger } from '../protocol/model'
import type { Simulation, TraceEvent } from '../protocol/types'

import { sourceUrl } from '../protocol/sources'

function JsonView({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const value = JSON.stringify(data, null, 2)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setCopyError(false)
    } catch {
      setCopyError(true)
    }
  }
  return (
    <div className="json-wrap">
      <div className="code-toolbar">
        <span>ILLUSTRATIVE PAYLOAD · NOT A WIRE SCHEMA</span>
        <button
          onClick={copy}
          className="text-button"
          aria-label="Copy illustrative payload"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {copyError && (
        <p className="copy-error">
          Clipboard unavailable. Select and copy the payload below.
        </p>
      )}
      <pre tabIndex={0}>{value}</pre>
    </div>
  )
}

export default function Inspector({
  simulation,
  event,
}: {
  simulation: Simulation
  event: TraceEvent
}) {
  const [tab, setTab] = useState('explain')
  const [bidId, setBidId] = useState('A1')
  const balance = ledger(event.state, simulation.bids)
  const bid = simulation.bids.find((b) => b.id === bidId)!
  return (
    <section className="panel inspector">
      <div
        className="inspector-tabs"
        role="tablist"
        aria-label="Event inspector"
      >
        {[
          ['explain', 'What happens', ShieldCheck],
          ['payload', 'Message', Code2],
          ['funds', 'Funds & proofs', FlaskConical],
        ].map(([id, label, Icon]) => (
          <button
            key={String(id)}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={tab === id ? 'selected' : ''}
            onClick={() => setTab(String(id))}
            onKeyDown={(e) => {
              const tabs = ['explain', 'payload', 'funds']
              const current = tabs.indexOf(tab)
              const next =
                e.key === 'ArrowRight'
                  ? (current + 1) % 3
                  : e.key === 'ArrowLeft'
                    ? (current + 2) % 3
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? 2
                        : -1
              if (next >= 0) {
                e.preventDefault()
                setTab(tabs[next])
                document.getElementById(`tab-${tabs[next]}`)?.focus()
              }
            }}
          >
            <Icon size={15} />
            {String(label)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'explain' && (
          <div className="explanation">
            <div className="event-eyebrow">
              <span className={`status-label ${event.outcome}`}>
                {event.outcome === 'blocked'
                  ? 'CHECK PREVENTS PROGRESS'
                  : event.outcome === 'info'
                    ? 'PROTOCOL BOUNDARY'
                    : 'SIMULATED STEP'}
              </span>
              <span className="mono">t+{event.time - START}s</span>
            </div>
            <h2>{event.title}</h2>
            <p className="event-body">{event.body}</p>
            {event.checks.length > 0 && (
              <div className="checks" aria-label="Validation checks">
                {event.checks.map((check) => (
                  <details
                    key={check.label}
                    className={check.pass ? 'pass' : 'fail'}
                  >
                    <summary>
                      {check.pass ? <Check size={14} /> : <X size={14} />}
                      <span>{check.label}</span>
                      <ChevronDown size={13} />
                    </summary>
                    <p>{check.detail}</p>
                  </details>
                ))}
              </div>
            )}
            <a
              className="source-link"
              href={sourceUrl(event.source)}
              target="_blank"
              rel="noreferrer"
            >
              Read the protocol rule <ExternalLink size={12} />
              <span>{event.source.split('#')[0]}</span>
            </a>
          </div>
        )}
        {tab === 'payload' && (
          <>
            <div className="inspector-note">
              Tokens, signatures and encryption are placeholders. Field names
              still under discussion are illustrative. SHA-256 hashes use the
              displayed original strings.
            </div>
            <JsonView key={event.id} data={event.data} />
          </>
        )}
        {tab === 'funds' && (
          <div className="funds-panel">
            <div className="accounting">
              <div>
                <span>Funded</span>
                <b>
                  {balance.funded} <small>sat</small>
                </b>
              </div>
              <span>=</span>
              <div>
                <span>Unspent</span>
                <b>{balance.locked}</b>
              </div>
              <span>+</span>
              <div>
                <span>Publisher</span>
                <b>{balance.publisher}</b>
              </div>
              <span>+</span>
              <div>
                <span>Fees</span>
                <b>{balance.fees}</b>
              </div>
              <span>+</span>
              <div>
                <span>Recovered</span>
                <b>{balance.refunded}</b>
              </div>
            </div>
            <p className="inspector-note">
              Gross sats per impression, never CPM. Each bid stays at its
              issuing mint. Refund fees are zero in this simulation; all fee
              amounts and timing margins are local example choices.
            </p>
            <div className="bid-inspect-heading">
              <h3>Inspect a bid</h3>
              <select
                aria-label="Bid to inspect"
                value={bidId}
                onChange={(e) => setBidId(e.target.value)}
              >
                {simulation.bids.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {b.bidder} · {b.amount} sat
                  </option>
                ))}
              </select>
            </div>
            <div className="proof-facts">
              <span>
                Proof status<strong>{event.state.bids[bidId].funds}</strong>
              </span>
              <span>
                Publisher status
                <strong>{event.state.bids[bidId].lifecycle}</strong>
              </span>
              <span>
                Refund deadline<strong>t+{bid.locktime - START}s</strong>
              </span>
              <span>
                Deliveries<strong>{event.state.bids[bidId].deliveries}</strong>
              </span>
            </div>
            <details className="artifact">
              <summary>
                Original bid & commitment <ChevronDown size={14} />
              </summary>
              <JsonView data={bidPayload(bid, simulation.request.id)} />
            </details>
            <details className="artifact">
              <summary>
                Decoded proofs & payment conditions <ChevronDown size={14} />
              </summary>
              <JsonView data={{ mint: bid.mint, proofs: bid.proofs }} />
            </details>
            <details className="artifact">
              <summary>
                Durable oracle authorization <ChevronDown size={14} />
              </summary>
              <JsonView
                data={
                  event.state.binding ?? {
                    status:
                      'Unassigned. A callback alone never binds this opportunity.',
                  }
                }
              />
            </details>
            <HashLab key={bid.id} original={bid.html} />
          </div>
        )}
      </div>
    </section>
  )
}

function HashLab({ original }: { original: string }) {
  const [edited, setEdited] = useState<string | null>(null)
  const [result, setResult] = useState<{
    original: string
    edited: string
  } | null>(null)
  const [error, setError] = useState('')
  async function compare() {
    try {
      const [a, b] = await Promise.all([
        sha256(original),
        sha256(edited ?? original),
      ])
      setResult({ original: a, edited: b })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hashing failed')
      setResult(null)
    }
  }
  return (
    <details className="artifact hash-lab">
      <summary>
        Try it: change the HTML hash <ChevronDown size={14} />
      </summary>
      <div className="hash-content">
        <p>
          Change a single space. These are real SHA-256 hashes of UTF-8 strings;
          no HTML normalization occurs.
        </p>
        <label htmlFor="hash-html">Decoded HTML string</label>
        <textarea
          id="hash-html"
          value={edited ?? original}
          onChange={(e) => {
            setEdited(e.target.value)
            setResult(null)
          }}
          spellCheck={false}
        />
        <div className="hash-actions">
          <button
            className="small-button"
            onClick={() => {
              setEdited((edited ?? original) + '\n')
              setResult(null)
            }}
          >
            Add a newline
          </button>
          <button className="small-button dark" onClick={compare}>
            Compare hashes
          </button>
          <button
            className="text-button"
            onClick={() => {
              setEdited(null)
              setResult(null)
              setError('')
            }}
          >
            Reset
          </button>
        </div>
        {result && (
          <div className="hash-result">
            <strong>
              {result.original === result.edited
                ? 'Identical strings, identical hashes'
                : 'Different hash — unchanged commitment is invalid'}
            </strong>
            <code>Original: {result.original}</code>
            <code>Edited: {result.edited}</code>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  )
}
