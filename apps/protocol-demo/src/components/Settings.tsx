import type { ReactNode } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { DEFAULT_CONFIG } from '../protocol/fixtures'
import type { Config } from '../protocol/types'

export default function Settings({
  config,
  onChange,
  onClose,
}: {
  config: Config
  onChange: (config: Config) => void
  onClose: () => void
}) {
  function select<K extends keyof Config>(
    key: K,
    label: string,
    options: [Config[K], string][],
    note?: string,
  ) {
    return (
      <label className="setting-field">
        {label}
        <select
          value={String(config[key])}
          onChange={(e) => onChange({ ...config, [key]: e.target.value })}
        >
          {options.map(([value, text]) => (
            <option key={String(value)} value={String(value)}>
              {text}
            </option>
          ))}
        </select>
        {note && <small>{note}</small>}
      </label>
    )
  }
  function toggle(
    key:
      'early' | 'trustedOracle' | 'requireSeller' | 'sellerListed' | 'repair',
    label: string,
    help: string,
  ) {
    return (
      <label className="toggle-row">
        <span>
          {label}
          <small>{help}</small>
        </span>
        <input
          type="checkbox"
          checked={config[key]}
          onChange={(e) => onChange({ ...config, [key]: e.target.checked })}
        />
      </label>
    )
  }
  return (
    <div className="settings-content">
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">SIMULATION CONTROLS</span>
          <h2>Change the conditions.</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close simulation controls"
        >
          <X size={20} />
        </button>
      </div>
      <p className="dialog-intro">
        Every change rebuilds the local trace from the beginning. The protocol
        rules stay fixed; participant choices and failure conditions change.
      </p>
      <fieldset>
        <legend>Publisher choices</legend>
        {select(
          'policy',
          'Selection policy',
          [
            ['net', 'Highest net proceeds'],
            ['gross', 'Highest gross amount'],
            ['creative', 'Prefer a 300 × 600 creative'],
          ],
          'All policies pay the winner’s full gross bid. Ties use bid ID in this demo.',
        )}
        {toggle(
          'early',
          'Select early at t+6s',
          'The bid collection deadline remains t+12s. A timely offer can still be unused.',
        )}
      </fieldset>
      <fieldset>
        <legend>Participation & request validation</legend>
        {toggle(
          'trustedOracle',
          'Independently trusted oracle',
          'Required before funding. Verify identity, payment key and pixel endpoint together.',
        )}
        {toggle(
          'requireSeller',
          'Bidders require a seller listing',
          'Optional bidder policy, not a ROB validity requirement.',
        )}
        {toggle(
          'sellerListed',
          'Verified seller listing exists',
          'Absence is not affirmative authorization, even if bidders proceed.',
        )}
        {select('requestFault', 'Public request', [
          ['none', 'Valid website context'],
          ['domain', 'Empty site.domain'],
          ['ip', 'Prohibited device.ip'],
          ['user', 'Excluded user object'],
        ])}
      </fieldset>
      <fieldset>
        <legend>Bid integrity</legend>
        {select('bidFault', 'Fault in A1 as received by publisher', [
          ['none', 'No fault'],
          ['mint', 'Unlisted mint'],
          ['unit', 'Non-sat keyset'],
          ['amount', 'Proof total differs from amount'],
          ['size', 'Change to another accepted size'],
          ['identity', 'Named identity differs from sender'],
          ['refund', 'Missing refund key'],
          ['signer', 'Sign commitment with identity key'],
          ['reuse', 'Reuse another bid’s proofs'],
          ['late', 'Arrive exactly at closes_at'],
        ])}
        <label className="setting-field">
          A1 refund deadline{' '}
          <span className="range-value">t+{config.lockSeconds}s</span>
          <input
            aria-label="A1 refund deadline"
            type="range"
            min="20"
            max="90"
            step="5"
            value={config.lockSeconds}
            onChange={(e) =>
              onChange({ ...config, lockSeconds: Number(e.target.value) })
            }
          />
          <small>
            B1 is five seconds later; A2 is ten seconds later. These example
            durations are not protocol minimums or maximums.
          </small>
        </label>
      </fieldset>
      <fieldset>
        <legend>Delivery & oracle checks</legend>
        {select('callback', 'Pixel callback', [
          ['before', 'Before authorization request'],
          ['after', 'After the first request'],
          ['missing', 'Never received'],
          ['direct', 'Publisher triggers it without rendering'],
        ])}
        {select('oracleFault', 'Evidence sent to the oracle', [
          ['none', 'Original evidence'],
          ['html', 'Append a newline to HTML'],
          ['token', 'Append a space to the token'],
          ['size', 'Change committed dimensions'],
          ['inputs', 'Duplicate a transaction input'],
          ['pixel', 'Mismatched pixel URL'],
          ['identity', 'Replace the signed bidder identity'],
          ['tag', 'Wrong commitment digest / tag'],
        ])}
        {toggle(
          'repair',
          'Retry with original evidence',
          'Restores exact artifacts after rejection; cannot invent a missing callback.',
        )}
      </fieldset>
      <fieldset>
        <legend>Mint processing</legend>
        {select('mint', 'Settlement and recovery', [
          ['online', 'Settle before expiry'],
          ['refund-first', 'After expiry: refund processes first'],
          ['publisher-first', 'After expiry: publisher processes first'],
          ['outage', 'Mint outage, then recovery retry'],
        ])}
      </fieldset>
      <div className="dialog-footer">
        <button
          className="small-button"
          onClick={() => onChange(DEFAULT_CONFIG)}
        >
          <RotateCcw size={14} /> Reset conditions
        </button>
        <button className="small-button dark" onClick={onClose}>
          Explore this trace →
        </button>
      </div>
    </div>
  )
}

export function Modal({
  children,
  onClose,
  label,
}: {
  children: ReactNode
  onClose: () => void
  label: string
}) {
  return (
    <dialog
      ref={(node) => {
        if (node && !node.open) node.showModal()
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      aria-label={label}
    >
      {children}
    </dialog>
  )
}
