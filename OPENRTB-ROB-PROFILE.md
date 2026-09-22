# Reusing OpenRTB objects in ROB

Research begun 2026-09-21; contextual object scope and public-data exclusions agreed 2026-09-22. V1 requires `site.domain`, supports optional `device`, and defers `user`; viewer IP addresses, precise coordinates, and persistent device identifiers are excluded. [OPENRTB.md](OPENRTB.md) contains the detailed field reference; [FLOW.md](FLOW.md) and [NOSTR.md](NOSTR.md) remain authoritative for ROB. This note does not define a complete wire schema.

## Which object?

`BidRequest` is the whole request; `Site` is its website-context object. Most fields are optional: the root requires `id` and nonempty `imp`; `Site` has no mandatory fields. Reusing these objects does not require populating every field. [IAB requirements and object model](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#objectbidrequest).

The main request families are:

```text
BidRequest
  id, auction controls, restrictions
  imp[]: banner / video / audio / native, deals
  site / app / dooh: publisher, content
  device: browser, hardware, IP, location
  user: identifiers, audience data
  source: supply chain
  regs: privacy signals
  ext: extensions
```

[IAB object model](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#objectmodel).

The complete `Site` field inventory is:

| Purpose | Fields |
| --- | --- |
| Identity | `id`, `name`, `domain` |
| Categories | `cattax`, `cat`, `sectioncat`, `pagecat` |
| Navigation | `page`, `ref`, `search` |
| Flags | `mobile`, `privacypolicy` |
| Nested context | `publisher`, `content` |
| Keywords | `keywords` or `kwarray` |
| Shared inventory | `inventorypartnerdomain` |
| Extensions | `ext` |

[IAB Site definition](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#objectsite).

## Why define a ROB profile?

Reusing `Site` and `Device` keeps established names and meanings so integrations can map contextual data without inventing another vocabulary. ROB adds required context and exclusions for data that must not appear in its public requests.

Adopting the entire request/response protocol would require additional decisions:

| OpenRTB baseline | Existing ROB decision and implication |
| --- | --- |
| `id`: exchange-assigned | `bid_request_id` is the signed Nostr event ID, obtained from its envelope. Putting that same event ID inside the content being hashed would create a circular definition. |
| `tmax`: milliseconds | `closes_at` is an absolute Unix timestamp in seconds. These are different deadline representations, so reuse needs an explicit mapping. |
| Bid `price`: CPM; `cur`: ISO-4217 | ROB commits a positive integer number of sats per impression. Reusing the standard names with changed units would be misleading. |
| HTTP POST; optional notices; no-bid responses | ROB uses a public Nostr request and private funded bids, with no bidder status messages. Object reuse does not require adopting these transport and notification behaviors. |

External baselines: [IAB BidRequest](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#objectbidrequest), [Bid](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#objectbid), [transport](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#transport). ROB decisions: [request identity and deadline](NOSTR.md), [funding and flow](FLOW.md).

There is also a distribution difference. ROB publishes requests for an open set of bidders, so a publisher cannot restrict their contents to particular intended bidders. **Design inference:** independently deciding which contextual fields belong in that public broadcast is necessary even if ROB reuses an existing schema. A page URL containing an account identifier, a referrer URL, or a search string can reveal information about a visitor; copying such values from an existing integration without reviewing them could publish that information. Optionality makes omission possible, but does not specify ROB's data boundary.

Adopting `device` brings fields capable of carrying IP addresses, location, and advertising identifiers. ROB therefore explicitly excludes viewer IP addresses, precise coordinates, and persistent device identifiers; omitting `user` alone would not establish that restriction.

## Accepted scope: Site and Device

**Agreed 2026-09-22:** use `site` and `device` for ROB v1 contextual data, preserving the standard field definitions from the repository's OpenRTB 2.6-202606 baseline and their referenced nested object meanings. The OpenRTB `user` object is outside v1. [ADR-0005](docs/adr/0005-reuse-site-and-device-context.md) records the decision; [FLOW.md: Advertising context](FLOW.md#advertising-context) defines its scope.

| Object | Meaning |
| --- | --- |
| `site` | The website and its publisher, page, and surrounding content. |
| `device` | The viewer's device and browser environment. |

Sources: [IAB Site](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#objectsite), [Device](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#objectdevice).

The accepted ROB profile requires a nonempty `site.domain` and makes `device` optional. Browser, language, screen, and capability information remain supported. The excluded standard fields and the rule against moving prohibited device data into extensions are defined in [FLOW.md: Advertising context](FLOW.md#advertising-context). These are ROB requirements applied to the reused structures, not changes to OpenRTB's own field definitions.

Preserving standard meanings also matters for dimensions: `device.w` and `device.h` describe physical screen pixels, while ROB's agreed banner sizes describe the creative in CSS pixels. They are different measurements. Referenced schemas include `Geo`, structured `UserAgent`/`BrandVersion`, and the `Publisher` and `Content` families used by `site`. [IAB Device](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#objectdevice), [object model](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/2.6-202606/2.6.md#objectmodel).

ROB's event identity, deadline, oracle information, and funded-payment semantics remain defined by ROB. The deferred `user` object's buyer-specific identifiers and cookie data need no v1 mapping.

## Remaining profile choices

- **Domain handling:** syntax/normalization and the optional ads.txt extension's exact entry/lookup/cache rules remain open. Seller authorization is specified as an optional bidder check; requiring a declared domain does not itself verify ownership. See [FLOW.md: Optional seller authorization](FLOW.md#optional-seller-authorization).
- **Extensions and remaining deprecated fields:** general handling for `ext`, unknown fields, and deprecated standard fields still belongs to the wire-profile work. Excluded device data cannot be reintroduced through these fields; the deprecated device-identifier fields are already excluded.
- **Other contextual values:** site URL handling and any further restrictions need explicit decisions. The agreed exclusions do not establish that the remaining metadata is anonymous.
