# Prebid banner size alternatives

Research checked 2026-09-21. This is reference material, not an adoption of Prebid fields or behavior into ROB. Source inspection uses Prebid.js commit [`382e41b7714b744d9db78ee7ef1aab596e266290`](https://github.com/prebid/Prebid.js/commit/382e41b7714b744d9db78ee7ef1aab596e266290), the upstream `master` revision retrieved on that date.

## Multiple sizes describe one slot

A Prebid ad unit represents a page slot and can advertise several accepted banner sizes through `mediaTypes.banner.sizes`. A single pair or an array of pairs is accepted. The following advertises two alternatives for the same slot, not two separate impressions. Prebid also supports `mediaTypes.banner.format`, an array of OpenRTB Format objects which takes precedence over `sizes`. [Ad unit reference](https://docs.prebid.org/dev-docs/adunit-reference.html#adunitmediatypesbanner)

```json
{
  "code": "sidebar",
  "mediaTypes": {
    "banner": {
      "sizes": [[300, 250], [300, 600]]
    }
  }
}
```

This is an illustrative ad-unit fragment; bidder configuration is omitted. The shared OpenRTB converter maps size pairs into `imp.banner.format` entries such as `{"w":300,"h":250}` when no explicit `ortb2Imp.banner.format` overrides them. The formats remain inside one impression's banner object. [Converter source](https://github.com/prebid/Prebid.js/blob/382e41b7714b744d9db78ee7ef1aab596e266290/libraries/ortbConverter/processors/banner.js#L14-L30)

## Each bid declares its creative's dimensions

The bidder-adapter response contract uses one `width` and one `height` for the returned creative. Flexible banner responses can instead supply `wratio` and `hratio`. These are declared dimensions or proportions, not a browser measurement proving that arbitrary HTML fits its slot. [Bidder adapter response reference](https://docs.prebid.org/dev-docs/bidder-adaptor.html#interpreting-the-response)

The inspected core `validBidSize` validator:

- Accepts explicitly supplied width and height after integer parsing, without comparing them against the requested size alternatives.
- Accepts a supplied aspect-ratio pair through a separate branch.
- Otherwise infers width and height only when the original request resolves to exactly one size.
- Rejects a banner response when none of those cases applies; the caller reports missing banner dimensions.

Therefore, multiple requested sizes require the response to disambiguate its size; the ordinary validator does not enforce an exact requested-size allowlist. This conclusion concerns the inspected core validation path, not every adapter, optional module, Prebid Server deployment, or ad-server configuration. [Validator and caller](https://github.com/prebid/Prebid.js/blob/382e41b7714b744d9db78ee7ef1aab596e266290/src/adapters/bidderFactory.ts#L634-L721)

The upstream tests explicitly exercise inference from one requested size and acceptance of dimensions or aspect ratios. They do not establish that a returned fixed size outside the request's alternatives will be rejected. [Single-size inference test](https://github.com/prebid/Prebid.js/blob/382e41b7714b744d9db78ee7ef1aab596e266290/test/spec/unit/core/bidderFactory_spec.js#L1269-L1300), [size validation tests](https://github.com/prebid/Prebid.js/blob/382e41b7714b744d9db78ee7ef1aab596e266290/test/spec/unit/core/bidderFactory_spec.js#L1517-L1566)

## Responsive filtering is a separate concern

The Size Mapping module evaluates publisher media-query configuration before requests go to adapters and filters the offered banner sizes. This lets a page advertise different alternatives for different viewport conditions. [Size Mapping](https://docs.prebid.org/dev-docs/modules/sizeMapping.html#how-size-config-works-for-banners)

Advanced Size Mapping provides per-ad-unit size buckets selected by viewport dimensions. A bucket can contain several fixed sizes; an empty list disables banners for that unit in the selected range. Thus responsive selection of an allowed-size list does not itself imply a fluid creative or an unrestricted size negotiation. [Advanced Size Mapping](https://docs.prebid.org/dev-docs/modules/sizeMappingV2.html#how-to-setup-adunit-level-sizeconfig)

Flexible aspect-ratio banners and extended `format` objects are additional capabilities. Supporting a finite list of exact width/height alternatives does not require ROB to adopt them. ROB's accepted inventory scope, wire fields, validation rules, and commitment coverage remain governed by [FLOW.md](FLOW.md) and [NOSTR.md](NOSTR.md).

ROB decision following this research, 2026-09-21: a request lists accepted fixed sizes in CSS pixels, each bid explicitly declares one pair, and the commitment covers those dimensions. Publisher and oracle reject unlisted sizes. Fluid/aspect-ratio sizing is deferred, and responsive selection of the advertised list remains publisher-local. This adopts the multiple-alternative model with an explicit ROB validation rule; final wire fields remain open. See [FLOW.md: Banner sizing](FLOW.md#banner-sizing).
