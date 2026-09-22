import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  Layers3,
  LockKeyhole,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SkipForward,
  Sparkles,
} from 'lucide-react'
import ProtocolMap from './components/ProtocolMap'
import Inspector from './components/Inspector'
import Settings, { Modal } from './components/Settings'
import Notes from './components/Notes'
import { CLOSE, DEFAULT_CONFIG, START } from './protocol/fixtures'
import { ledger } from './protocol/model'
import { SCENARIOS, simulate, STAGES } from './protocol/simulation'
import type { Config, Simulation, TraceEvent } from './protocol/types'

function initialScenario() {
  const id = new URLSearchParams(window.location.search).get('scenario')
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]
}

export default function App() {
  const [scenarioId, setScenarioId] = useState(() => initialScenario().id)
  const [config, setConfig] = useState<Config>(() => ({
    ...DEFAULT_CONFIG,
    ...initialScenario().config,
  }))
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [modal, setModal] = useState<'settings' | 'notes' | null>(null)
  const [traceOpen, setTraceOpen] = useState(false)
  const restoreFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    let cancelled = false
    simulate(config)
      .then((result) => {
        if (!cancelled) {
          setSimulation(result)
          setError('')
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [config])
  useEffect(() => {
    if (!playing || !simulation) return
    const timer = window.setTimeout(() => {
      if (index >= simulation.events.length - 1) setPlaying(false)
      else setIndex(index + 1)
    }, 2200 / speed)
    return () => window.clearTimeout(timer)
  }, [playing, simulation, index, speed])
  useEffect(() => {
    function keydown(e: KeyboardEvent) {
      if (
        modal ||
        !simulation ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement &&
          e.target.closest(
            'input, textarea, select, button, a, summary, [contenteditable]',
          ))
      )
        return
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setPlaying(false)
        setIndex((i) => Math.min(i + 1, simulation.events.length - 1))
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setPlaying(false)
        setIndex((i) => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [modal, simulation])

  function jump(next: number) {
    setPlaying(false)
    setIndex(next)
  }
  function changeConditions(next: Config) {
    setPlaying(false)
    setIndex(0)
    setScenarioId('custom')
    setConfig(next)
  }
  function chooseScenario(id: string) {
    const next = SCENARIOS.find((s) => s.id === id)
    if (!next) return
    setPlaying(false)
    setIndex(0)
    setScenarioId(id)
    setConfig({ ...DEFAULT_CONFIG, ...next.config })
    const url = new URL(window.location.href)
    url.searchParams.set('scenario', id)
    window.history.replaceState(null, '', url)
  }
  function showModal(next: 'settings' | 'notes') {
    restoreFocus.current = document.activeElement as HTMLElement
    setPlaying(false)
    setModal(next)
  }
  function closeModal() {
    document.querySelector('dialog')?.close()
    setModal(null)
    const target = restoreFocus.current
    window.requestAnimationFrame(() => target?.focus())
  }
  function exportTrace() {
    if (!simulation) return
    const blob = new Blob(
      [
        JSON.stringify(
          {
            notice:
              'ROB semantic simulation. Not real tokens, signatures, or interoperable wire schemas.',
            ...simulation,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rob-trace-${scenarioId}.json`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const event =
    simulation?.events[Math.min(index, simulation.events.length - 1)]
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)
  const loading =
    !simulation || JSON.stringify(simulation.config) !== JSON.stringify(config)
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to simulation
      </a>
      <header className="topbar">
        <a className="brand" href="./" aria-label="ROB protocol lab home">
          <span className="brand-mark">
            <Command size={22} />
          </span>
          <strong>
            rob<span>.</span>
          </strong>
          <span className="brand-divider" />
          <span className="brand-caption">protocol lab</span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className="nav-active"
            onClick={() => {
              setModal(null)
            }}
          >
            Simulation
          </button>
          <button onClick={() => showModal('notes')}>
            Protocol notes <ArrowUpRight size={13} />
          </button>
        </nav>
        <span className="sandbox-label">
          <span /> LOCAL SIMULATION
        </span>
      </header>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-top">
            <span className="eyebrow">THE PLAYGROUND</span>
            <div className="sidebar-title">
              Follow the protocol <Layers3 size={17} />
            </div>
            <label className="scenario-label" htmlFor="scenario">
              Scenario
            </label>
            <select
              id="scenario"
              value={scenarioId}
              onChange={(e) => chooseScenario(e.target.value)}
            >
              {scenarioId === 'custom' && (
                <option value="custom">Custom conditions</option>
              )}
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="scenario-description">
              {scenario?.description ??
                'Your participant choices and failure conditions, applied to the same protocol rules.'}
            </p>
            <button
              className="conditions-button"
              onClick={() => showModal('settings')}
            >
              <Settings2 size={15} /> Change conditions <span>↗</span>
            </button>
          </div>
          <div className="stages-heading">
            <span className="eyebrow">PROTOCOL CHAPTERS</span>
            <span>09</span>
          </div>
          <nav className="stage-nav" aria-label="Protocol chapters">
            {STAGES.map((stage, i) => {
              const first =
                simulation?.events.findIndex((e) => e.stage === stage.id) ?? -1
              const active = event?.stage === stage.id
              const completed = first >= 0 && index > first && !active
              return (
                <button
                  key={stage.id}
                  disabled={first < 0 || loading}
                  onClick={() => jump(first)}
                  className={`${active ? 'active' : ''} ${completed ? 'visited' : ''}`}
                  aria-current={active ? 'step' : undefined}
                  title={
                    first < 0
                      ? 'Not reached under these conditions'
                      : stage.description
                  }
                >
                  <span className="stage-number">
                    {completed ? (
                      <Check size={12} />
                    ) : (
                      String(i + 1).padStart(2, '0')
                    )}
                  </span>
                  <span>
                    <strong>{stage.label}</strong>
                    <small>{stage.description}</small>
                  </span>
                  {active && <span className="stage-dot" />}
                </button>
              )
            })}
          </nav>
          <div className="sidebar-bottom">
            <div className="boundary-icon">
              <CircleHelp size={18} />
            </div>
            <strong>A signal, not a proof.</strong>
            <p>
              A pixel callback doesn’t establish rendering or viewability.
              Explore the trust boundary.
            </p>
            <button onClick={() => chooseScenario('spoof')}>
              Try the scenario <ArrowRight size={13} />
            </button>
          </div>
          <div className="sidebar-version">ROB v1 · specification draft</div>
        </aside>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="tiny-square" /> REAL OPEN BIDDING / INTERACTIVE
                DEMO
              </div>
              <h1>
                An open auction.
                <br />
                <span>Every step, visible.</span>
              </h1>
              <p>
                Follow a banner opportunity from a public request to the last
                sat.
                <br className="desktop-break" /> Pause, inspect the messages,
                and see what happens when conditions change.
              </p>
            </div>
            <div className="heading-aside">
              <div className="protocol-symbol">
                <span />
                <span />
                <span />
              </div>
              <span>NOSTR + CASHU</span>
              <small>Open by design.</small>
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              Could not build the simulation: {error}. Use localhost or HTTPS
              for Web Crypto.
            </div>
          )}
          {!event || !simulation ? (
            <div className="loading-state">Preparing the protocol model…</div>
          ) : (
            <>
              <section className="playback" aria-label="Simulation playback">
                <div className="playback-left">
                  <button
                    className="play-button"
                    onClick={() => {
                      if (index === simulation.events.length - 1) setIndex(0)
                      setPlaying(!playing)
                    }}
                    disabled={loading}
                    aria-label={
                      playing ? 'Pause simulation' : 'Play simulation'
                    }
                  >
                    {playing ? (
                      <Pause size={15} fill="currentColor" />
                    ) : (
                      <Play size={15} fill="currentColor" />
                    )}
                    {playing
                      ? 'Pause'
                      : index === simulation.events.length - 1
                        ? 'Replay'
                        : 'Play'}
                  </button>
                  <div className="step-buttons">
                    <button
                      className="icon-button"
                      disabled={index === 0 || loading}
                      onClick={() => jump(index - 1)}
                      aria-label="Previous step"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={
                        index >= simulation.events.length - 1 || loading
                      }
                      onClick={() => jump(index + 1)}
                      aria-label="Next step"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  <div className="playback-progress">
                    <label htmlFor="timeline">
                      {loading
                        ? 'Rebuilding trace…'
                        : `Step ${index + 1} of ${simulation.events.length}`}
                      <span>
                        {STAGES.find((s) => s.id === event.stage)?.label}
                      </span>
                    </label>
                    <input
                      id="timeline"
                      type="range"
                      min="0"
                      max={simulation.events.length - 1}
                      value={index}
                      onChange={(e) => jump(Number(e.target.value))}
                      disabled={loading}
                      aria-label="Protocol timeline"
                    />
                  </div>
                </div>
                <div className="playback-right">
                  <select
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    aria-label="Playback speed"
                  >
                    <option value="0.5">0.5×</option>
                    <option value="1">1× speed</option>
                    <option value="2">2× speed</option>
                    <option value="4">4× speed</option>
                  </select>
                  <button
                    className="icon-button"
                    onClick={() => jump(0)}
                    aria-label="Restart trace"
                    title="Restart trace"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => jump(simulation.events.length - 1)}
                    aria-label="Jump to final state"
                    title="Jump to final state"
                  >
                    <SkipForward size={16} />
                  </button>
                </div>
              </section>
              <ProtocolMap event={event} playing={playing} />
              <div className="workspace-grid">
                <div className="workspace-main">
                  <Inspector simulation={simulation} event={event} />
                  <Bids simulation={simulation} event={event} />
                </div>
                <div className="workspace-side">
                  <StateCard simulation={simulation} event={event} />
                  <CreativePreview simulation={simulation} event={event} />
                  <div className="tip">
                    <BookOpen size={16} />
                    <p>
                      <strong>The inspector sees everything.</strong>Actual
                      bidders receive no ROB outcome or rejection messages.
                    </p>
                  </div>
                </div>
              </div>
              <section className="panel trace-panel">
                <button
                  className="trace-heading"
                  onClick={() => setTraceOpen(!traceOpen)}
                  aria-expanded={traceOpen}
                >
                  <span>
                    <Layers3 size={16} /> Full event trace{' '}
                    <small>{simulation.events.length} events</small>
                  </span>
                  <span>{traceOpen ? 'Collapse −' : 'Explore +'}</span>
                </button>
                {traceOpen && (
                  <div className="event-list">
                    {simulation.events.map((e) => (
                      <button
                        key={e.id}
                        className={`${e.id === index ? 'current' : ''} ${e.outcome}`}
                        onClick={() => jump(e.id)}
                      >
                        <span className="mono">
                          {String(e.id + 1).padStart(2, '0')}
                        </span>
                        <span className="trace-time">+{e.time - START}s</span>
                        <strong>{e.title}</strong>
                        <span>
                          {e.from} → {e.to}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <footer className="main-footer">
                <span>
                  <ShieldCheck size={13} /> Simulated funds. No network calls.
                  No real verification.
                </span>
                <div>
                  <button onClick={exportTrace}>
                    <ArrowDownToLine size={13} /> Export trace
                  </button>
                  <button onClick={() => showModal('notes')}>
                    Model & specification <ArrowUpRight size={13} />
                  </button>
                </div>
              </footer>
            </>
          )}
        </main>
      </div>
      {modal && (
        <Modal
          onClose={closeModal}
          label={
            modal === 'settings' ? 'Simulation controls' : 'Protocol notes'
          }
        >
          {modal === 'settings' ? (
            <Settings
              config={config}
              onChange={changeConditions}
              onClose={closeModal}
            />
          ) : (
            <Notes onClose={closeModal} />
          )}
        </Modal>
      )}
    </>
  )
}

function Bids({
  simulation,
  event,
}: {
  simulation: Simulation
  event: TraceEvent
}) {
  return (
    <section className="panel bids-panel">
      <div className="panel-heading">
        <div>
          Independent offers <span className="count-pill">03</span>
        </div>
        <span className="subtle">One impression · first-price</span>
      </div>
      <div className="bid-cards">
        {simulation.bids.map((bid) => {
          const state = event.state.bids[bid.id]
          const selected = event.state.selected === bid.id
          return (
            <div
              key={bid.id}
              className={`bid-card ${selected ? 'winner' : ''} ${state.lifecycle === 'rejected' ? 'rejected' : ''}`}
            >
              <div className="bid-card-top">
                <span className={`bid-avatar ${bid.bidder.toLowerCase()}`}>
                  {bid.bidder[0]}
                </span>
                <strong>{bid.bidder}</strong>
                <span className="mono">{bid.id}</span>
              </div>
              <div className="bid-value">
                {bid.amount}
                <span>
                  sat <small>/ impression</small>
                </span>
                {selected && (
                  <span className="selected-check" title="Selected">
                    <Check size={12} />
                  </span>
                )}
              </div>
              <div className="bid-metadata">
                <span>
                  {bid.width} × {bid.height}
                </span>
                <span>
                  Mint {bid.mint.includes('mint-a') ? 'A' : 'B'} · {bid.fee} sat
                  fee
                </span>
              </div>
              <div className="bid-status" title={state.reason}>
                <span
                  className={
                    state.lifecycle === 'rejected'
                      ? 'red-dot'
                      : selected
                        ? 'green-dot'
                        : 'gray-dot'
                  }
                />
                {state.funds === 'refunded'
                  ? 'Refunded'
                  : state.funds === 'settled'
                    ? 'Settled'
                    : selected
                      ? 'Selected · funds unspent'
                      : state.lifecycle === 'unused'
                        ? 'Unused after early selection'
                        : state.lifecycle[0].toUpperCase() +
                          state.lifecycle.slice(1)}
              </div>
            </div>
          )
        })}
      </div>
      <div className="bids-foot">
        <span className="small-dot" /> Atlas A2 is a separate offer. It never
        replaces A1.
      </div>
    </section>
  )
}

function StateCard({
  simulation,
  event,
}: {
  simulation: Simulation
  event: TraceEvent
}) {
  const totals = ledger(event.state, simulation.bids)
  return (
    <section className="panel state-panel">
      <div className="panel-heading">
        <div>
          <Clock3 size={15} /> Protocol state
        </div>
        <span className="clock-value mono">+{event.time - START}s</span>
      </div>
      <div className="state-rows">
        <div>
          <span>Collection deadline</span>
          <strong>
            {event.time < CLOSE
              ? `${CLOSE - event.time}s remaining`
              : 'Reached'}
          </strong>
        </div>
        <div>
          <span>Selected bid</span>
          <strong>{event.state.selected ?? 'None'}</strong>
        </div>
        <div>
          <span>Oracle binding</span>
          <strong className={event.state.binding ? 'green-text' : ''}>
            {event.state.binding
              ? `${event.state.binding.bidId} · durable`
              : 'Unassigned'}
          </strong>
        </div>
        <div>
          <span>Spend signatures</span>
          <strong>
            {event.state.binding
              ? event.state.publisherSigned
                ? '2 / 2'
                : '1 / 2'
              : '0 / 2'}
          </strong>
        </div>
      </div>
      <div className="value-state">
        <div>
          <span>
            <LockKeyhole size={13} /> Unspent funds
          </span>
          <strong>
            {totals.locked}
            <small>sat</small>
          </strong>
        </div>
        <div>
          <span>Publisher proceeds</span>
          <strong>
            {totals.publisher}
            <small>sat</small>
          </strong>
        </div>
        <div>
          <span>Bidder recovery</span>
          <strong>
            {totals.refunded}
            <small>sat</small>
          </strong>
        </div>
      </div>
      <div className="state-note">
        {event.state.binding
          ? 'Authorization persists even if settlement fails or a refund succeeds.'
          : 'Neither selection nor a callback assigns payment authorization.'}
      </div>
    </section>
  )
}

function CreativePreview({
  simulation,
  event,
}: {
  simulation: Simulation
  event: TraceEvent
}) {
  const rendered = simulation.bids.find((b) => b.id === event.state.rendered)
  return (
    <section className="panel preview-panel">
      <div className="panel-heading">
        <div>Viewer’s page</div>
        <span className="subtle">SCHEMATIC</span>
      </div>
      <div className="mini-browser">
        <div className="mini-browser-bar">
          <span />
          <span />
          <span />
          <small>fieldnotes.example</small>
        </div>
        <div className="mini-site">
          <span className="mini-wordmark">
            fieldnotes<span>®</span>
          </span>
          <div className="mini-rule" />
          <div className="mini-layout">
            <div className="mini-editorial">
              <div className="mini-picture" />
              <b>
                Make room
                <br />
                for discovery.
              </b>
              <i />
              <i />
              <i />
            </div>
            <div className={`mini-ad ${rendered ? 'filled' : ''}`}>
              {rendered ? (
                <>
                  <span className="mini-ad-brand">
                    {rendered.bidder.toUpperCase()}
                  </span>
                  <Sparkles size={28} strokeWidth={1} />
                  <b>
                    A little more
                    <br />
                    outside.
                  </b>
                  <span className="mini-ad-cta">Explore ↗</span>
                  <span
                    className="pixel-dot"
                    title="Illustrative embedded pixel"
                  />
                </>
              ) : (
                <>
                  <div className="empty-slot">+</div>
                  <span>Banner slot</span>
                  <small>Awaiting a creative</small>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="preview-caption">
        {rendered
          ? `${rendered.id} · ${rendered.width} × ${rendered.height} CSS px. The actual committed markup is in the inspector.`
          : 'No rendered creative at this step.'}{' '}
        Preview is illustrative; HTML is never executed.
      </p>
    </section>
  )
}
