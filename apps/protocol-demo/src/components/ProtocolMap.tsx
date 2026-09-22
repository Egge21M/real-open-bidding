import {
  ArrowDownLeft,
  Check,
  CircleDollarSign,
  Globe2,
  Radio,
  ScanEye,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { Actor, TraceEvent } from '../protocol/types'

const actors = [
  { id: 'bidder', label: 'Bidders', sub: 'Atlas + Bloom', icon: Sparkles },
  { id: 'relay', label: 'Nostr relay', sub: 'Ephemeral delivery', icon: Radio },
  { id: 'publisher', label: 'Publisher', sub: 'Fieldnotes', icon: Globe2 },
  { id: 'browser', label: 'Viewer', sub: 'Browser', icon: ScanEye },
  {
    id: 'oracle',
    label: 'Oracle',
    sub: 'Payment authorizer',
    icon: ShieldCheck,
  },
  { id: 'mint', label: 'Cashu mint', sub: 'A / B · sat keysets', icon: Server },
] as const

export default function ProtocolMap({
  event,
  playing,
}: {
  event: TraceEvent
  playing: boolean
}) {
  const position = (actor: Actor) =>
    75 + actors.findIndex((a) => a.id === actor) * 150
  const x1 = position(event.from),
    x2 = position(event.to)
  const local = x1 === x2
  const path = local
    ? `M ${x1 - 18} 18 C ${x1 - 70} 110, ${x1 + 70} 110, ${x1 + 18} 18`
    : `M ${x1} 18 C ${x1} 100, ${x2} 100, ${x2} 18`
  const color = event.outcome === 'blocked' ? '#b8523c' : '#53703d'
  return (
    <section
      className="panel map-panel"
      aria-label="Protocol participants and current message"
    >
      <div className="panel-heading">
        <div>
          <span className={`live-dot ${playing ? 'pulsing' : ''}`} />
          Protocol map
        </div>
        <span className="subtle mono">06 PARTICIPANTS</span>
      </div>
      <div className="map-scroll">
        <div className="map-canvas">
          <div className="actor-grid">
            {actors.map(({ id, label, sub, icon: Icon }) => (
              <div
                key={id}
                className={`actor ${event.from === id || event.to === id ? 'active' : ''} actor-${id}`}
              >
                <div className="actor-icon">
                  <Icon size={23} strokeWidth={1.6} />
                  {id === 'oracle' && event.state.binding && (
                    <span className="actor-check">
                      <Check size={10} />
                    </span>
                  )}
                </div>
                <strong>{label}</strong>
                <small>{sub}</small>
              </div>
            ))}
          </div>
          <svg
            className="message-path"
            viewBox="0 0 900 110"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${event.from} to ${event.to}: ${event.title}`}
          >
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            </defs>
            {actors.map((a) => (
              <line
                key={a.id}
                x1={position(a.id)}
                y1="0"
                x2={position(a.id)}
                y2="105"
                stroke="#dfe4d9"
                strokeDasharray="3 5"
              />
            ))}
            <path
              key={`${event.id}-line`}
              d={path}
              stroke={color}
              strokeWidth="2"
              fill="none"
              markerEnd="url(#arrow)"
              className="active-path"
            />
            {playing && (
              <circle r="4" fill={color}>
                <animateMotion
                  key={event.id}
                  dur="1.8s"
                  repeatCount="indefinite"
                  path={path}
                />
              </circle>
            )}
          </svg>
        </div>
      </div>
      <div
        className={`message-caption ${event.outcome === 'blocked' ? 'blocked' : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="message-type">
          {event.from === event.to
            ? 'LOCAL ACTION'
            : `${event.from.toUpperCase()} → ${event.to.toUpperCase()}`}
        </span>
        <span>{event.title}</span>
        <ArrowDownLeft size={16} />
      </div>
      <div className="map-foot">
        <span>
          <CircleDollarSign size={14} /> Only mint completion moves value
        </span>
        <span>All network activity is simulated</span>
      </div>
    </section>
  )
}
