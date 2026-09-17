export function Mark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M5 25V7h11a7 7 0 0 1 0 14H5M16 21l9 8"
        stroke="currentColor"
        strokeWidth="5"
      />
      <path d="M24 3v8M20 7h8" stroke="currentColor" strokeWidth="3" />
    </svg>
  )
}

export function ProtocolArtwork() {
  return (
    <div
      className="protocol-art"
      aria-label="Open bid discovery through Nostr, with payment jointly authorized by publisher and oracle"
      role="img"
    >
      <svg viewBox="0 0 660 590" fill="none" aria-hidden="true">
        <defs>
          <pattern
            id="dot-grid"
            x="0"
            y="0"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="currentColor" opacity=".16" />
          </pattern>
        </defs>
        <rect width="660" height="590" fill="url(#dot-grid)" />
        <g stroke="currentColor" opacity=".12">
          <circle cx="334" cy="292" r="213" />
          <circle cx="334" cy="292" r="264" />
          <path d="M334 14v552M55 292h558" strokeDasharray="4 7" />
        </g>
        <path
          className="art-track"
          d="M133 170H278Q330 170 330 225V340Q330 398 387 398H514"
        />
        <path
          className="art-track"
          d="M134 397H215Q270 397 270 340V225Q270 170 330 170H514"
        />
        <path
          className="art-track art-track-back"
          d="M134 170V105Q134 73 170 73H480Q515 73 515 105V170M134 397v74q0 32 35 32h312q34 0 34-32v-74"
        />
        <path
          className="art-stream"
          d="M133 170H278Q330 170 330 225V340Q330 398 387 398H514"
        />
        <path
          className="art-stream second-stream"
          d="M134 397H215Q270 397 270 340V225Q270 170 330 170H514"
        />
        <g className="art-node" transform="translate(94 130)">
          <rect width="80" height="80" rx="19" />
          <path d="M24 56V25h32v31M19 56h42M31 33h5m8 0h5m-18 9h5m8 0h5M36 56V49h9v7" />
        </g>
        <g className="art-node" transform="translate(474 130)">
          <rect width="80" height="80" rx="19" />
          <path d="M28 32a17 17 0 0 1 24 0m-30-6a25 25 0 0 1 36 0M34 39a9 9 0 0 1 12 0M40 46v13" />
          <circle cx="40" cy="46" r="3" />
        </g>
        <g className="art-node" transform="translate(94 357)">
          <rect width="80" height="80" rx="19" />
          <path d="M17 40s9-14 23-14 23 14 23 14-9 14-23 14-23-14-23-14Z" />
          <circle cx="40" cy="40" r="7" />
        </g>
        <g className="art-node art-cash" transform="translate(474 357)">
          <rect width="80" height="80" rx="40" />
          <circle cx="40" cy="40" r="27" />
          <path d="M48 27H36a7 7 0 0 0 0 14h8a7 7 0 0 1 0 14H30m9-34v39m6-39v39" />
        </g>
        <g className="art-center" transform="translate(300 284)">
          <circle r="48" />
          <path d="M-12 5v-17a12 12 0 0 1 24 0V5M-19 3h38v28h-38z" />
          <circle cy="15" r="3" />
        </g>
        <g className="art-label">
          <text x="134" y="236">
            PUBLISHER
          </text>
          <text x="514" y="236">
            OPEN NETWORK
          </text>
          <text x="134" y="464">
            ORACLE
          </text>
          <text x="514" y="464">
            CASHU ECASH
          </text>
        </g>
        <g className="art-annotation">
          <text x="323" y="57">
            OPEN DISCOVERY
          </text>
          <text x="324" y="535">
            JOINT AUTHORIZATION
          </text>
        </g>
        <circle cx="134" cy="105" r="4" className="signal-point" />
        <circle cx="515" cy="473" r="4" className="signal-point" />
      </svg>
      <div className="art-caption">
        <span className="status-dot" /> A protocol. An open playing field.
      </div>
    </div>
  )
}
