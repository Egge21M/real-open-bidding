# Prebid creative payload research

Research date: 2026-09-16.

Scope: a baseline from current official Prebid documentation and public source for discussing ROB creative types. This note does not adopt or change any ROB protocol decisions. Prebid.js adapter response objects, Prebid Server OpenRTB responses, and the content eventually rendered in the browser are separate layers. Links to `master` describe the source retrieved for this research, not a pinned release.

ROB decision following this research, 2026-09-16: **v1 supports HTML banners only**, with complete markup supplied as a string and the oracle pixel inserted before signing. See [FLOW.md](FLOW.md#v1-creative-scope) and [NOSTR.md](NOSTR.md) for the current specification. The other Prebid formats below remain reference material for possible later versions.

Subsequent ROB decisions restrict inventory to websites, allow [multiple accepted fixed sizes](FLOW.md#banner-sizing) for one impression, and require each bid to commit to one advertised size. V1 uses one shared [rendering profile](FLOW.md#v1-creative-scope), whose precise capabilities and isolation rules remain open. Follow-up research covers [banner sizes](PREBID-SIZES.md) and [auction completion](PREBID-AUCTION.md).

## Banner

Banner bids commonly carry an HTML markup string in `bid.ad`, or a URL in `bid.adUrl`. The OpenRTB banner response converter maps `adm` to `ad`; if only `nurl` is provided, it maps that URL to `adUrl`. When both exist, the converter prepends a tracking pixel for `nurl` to the markup. This is concrete evidence that the rendering payload may differ from the original server response. [Banner response converter](https://github.com/prebid/Prebid.js/blob/master/libraries/ortbConverter/processors/banner.js).

The normal `pbjs.renderAd` API targets an iframe document, using the bid ID to locate the creative. [renderAd API](https://docs.prebid.org/dev-docs/publisher-api-reference/renderAd.html). Current rendering preparation also expands `AUCTION_PRICE` and `CLICKTHROUGH` macros in `ad` and `adUrl`. [Rendering preparation](https://github.com/prebid/Prebid.js/blob/master/src/adRendering.ts).

Custom renderers are an additional integration mechanism across media types, not a universal requirement to convert every bid into HTML before submitting it. The renderer interface distinguishes markup, markup URL, VAST XML, and VAST URL. [Renderer data](https://docs.prebid.org/dev-docs/renderer.html#rendering-data).

## Video

A Prebid.js video response can carry either `bid.vastXml` (a VAST XML string) or `bid.vastUrl` (a URL from which VAST can be retrieved). The adapter documentation explicitly describes both forms. Video is therefore not generally delivered as serialized HTML. [Prebid.js bidder adapter guide](https://docs.prebid.org/dev-docs/bidder-adaptor.html#supporting-video).

Playback depends on the integration. An in-player integration supplies the winning ad to a video player. In-renderer integration, formerly called outstream, uses rendering code supplied by the publisher or demand partner; that code obtains the VAST from the response or fetches its URL. The renderer and player have responsibilities beyond simply inserting markup into the DOM. [Video overview](https://docs.prebid.org/prebid-video/video-overview).

Current core validation distinguishes those paths: an instream/default video response requires a VAST URL or XML. XML-only responses normally need remote or local caching, with an explicit `cache.allowVastXmlOnly` exception. Outstream without `useCacheKey` requires a renderer on the bid, ad unit, or video media type; its validator does not independently require `vastXml` or `vastUrl`. Thus the standard VAST forms are not an exhaustive guarantee about every custom-renderer payload. [Video source, `checkVideoBidSetup`](https://github.com/prebid/Prebid.js/blob/master/src/video.ts).

## Native

Native is a structured set of assets, such as title, description, image, and destination link, that a renderer combines with a publisher-defined template. Its bid payload is not the final HTML or final DOM. The current preferred adapter interface uses OpenRTB Native data at `bid.native.ortb`; the adapter guide also documents legacy Prebid-specific fields such as `title`, `body`, `image`, and `clickUrl`. [Adapter native interface](https://docs.prebid.org/dev-docs/bidder-adaptor.html#supporting-native).

The native implementation guide describes Native OpenRTB 1.2 support with an explicit exception for native video. Templates may live in an ad server, the ad unit, or an external JavaScript renderer. Native assets remain in Prebid.js memory; the creative requests them using `postMessage`, and rendering produces HTML within an iframe. At the rendering interface, the guide refers to the response as `bid.ortb`, which should not be confused with the adapter's `bid.native.ortb` field. [Native implementation guide](https://docs.prebid.org/prebid/native-implementation.html).

Version distinction: the guide marks legacy `sendTargetingKeys` as unsupported from Prebid.js 9.0 onward. Native impression trackers are part of the response and support image or JavaScript methods according to the requested support. [Native configuration and tracking](https://docs.prebid.org/prebid/native-implementation.html).

## Audio

Audio is a distinct currently documented Prebid.js media type. Its ad-unit configuration includes supported audio MIME types, durations, and a context defaulting to instream. This should not be described as HTML simply because it is requested from JavaScript. [Ad-unit audio configuration](https://docs.prebid.org/dev-docs/adunit-reference.html#adunitmediatypesaudio), [core media types](https://github.com/prebid/Prebid.js/blob/master/src/mediaTypes.ts).

The retrieved core source aliases `AudioBid` to `VideoBid`, whose properties include the VAST payload fields and caching metadata. This is evidence of shared video/audio bid plumbing, rather than a separate raw-audio-byte payload in the bid. [Core bid types](https://github.com/prebid/Prebid.js/blob/master/src/bidfactory.ts), [video payload fields](https://github.com/prebid/Prebid.js/blob/master/src/video.ts).

The renderer documentation explicitly permits an audio media-type renderer, while identifying banner and native as media types with built-in default rendering. A player or suitable renderer remains an integration responsibility. The sources checked here do not establish a universal audio adapter payload contract or minimum supporting release; support should be checked for the chosen Prebid release and adapter before implementation. [Renderer documentation](https://docs.prebid.org/dev-docs/renderer.html).

## Implications for ROB (design analysis, not adopted requirements)

The comparison suggests separating the media category (banner, video, audio, native) from payload representation (HTML, VAST XML, structured Native JSON, or a URL). A string field does not necessarily contain HTML. Our [OpenRTB reference](OPENRTB.md#7-native-payloads) already records that a native `adm` can be a serialized JSON string.

The ROB commitment can in principle cover a typed string containing HTML, XML, or serialized JSON. V1 now specifies [SHA-256 over the exact UTF-8 HTML string](FLOW.md#html-creative-hash), agreed on 2026-09-17. Supporting other formats would require their own exact hashing rules, schemas, and rendering obligations. For native assets, the signed data precedes template rendering; for VAST, the signed document precedes player processing. Hashing the resulting DOM would therefore be a different design from hashing the supplied payload.

The current [ROB flow](FLOW.md#creative-and-verification) requires a bidder-inserted image pixel and unchanged submitted payload after signing. HTML banners fit that convention directly. Supporting native or VAST requires deciding where the oracle callback appears in the signed data and when the renderer/player requests it. Prebid's macro substitution and tracking-pixel insertion also mean any integration must define the exact point at which the ROB payload becomes final and is signed.

A hash of a creative URL commits only to the URL, not to the response later served from it. Likewise, hashing markup does not hash its referenced images or scripts. ROB currently excludes changes to bidder-hosted dependencies from its commitment threat model; adopting more formats should state that boundary explicitly rather than imply that a payload hash freezes every rendered asset. No media types, new verification profiles, or dependency-hash requirements are adopted by this research note.
