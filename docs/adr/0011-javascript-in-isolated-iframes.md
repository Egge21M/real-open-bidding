# Support JavaScript banners inside isolated iframes

Bidders need a common contract for executable HTML creatives, and the exact-HTML commitment prevents publishers from removing scripts or rewriting a submitted creative. The shared v1 rendering profile permits JavaScript, HTTPS assets/scripts, and new-tab advertiser landing pages inside an isolated iframe while denying access to the publisher page's DOM/storage and navigation of that page. The default renderer serves the original HTML as a document with HTTP content policies and an iframe sandbox, accepting an additional document fetch to enforce policy without rewriting signed markup; isolation does not promise cookieless requests or user-click-only popups.

Agreed on 2026-09-22. The protocol requirements are in [FLOW.md: Rendering profile](../../FLOW.md#rendering-profile), with implementation decisions tracked in [PUBLISHER.md](../../PUBLISHER.md).
