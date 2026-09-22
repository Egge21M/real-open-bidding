# Keep authorized swap outputs fixed

The oracle authorizes a particular Cashu swap and durably fixes its ordered output signing data with the bid commitment and original funding, returning the stored signature for exact retries. Rejecting replacement outputs keeps retries tied to one approved spend and avoids authorizing competing output sets, at the cost of requiring the publisher to retain its output secrets and blinding factors. Neither a fresh HTTP authentication event nor settlement failure permits changing those outputs after authorization.

Agreed on 2026-09-22. Requirements are in [FLOW.md: One authorized bid per impression](../../FLOW.md#one-authorized-bid-per-impression), with the response defined in [NOSTR.md](../../NOSTR.md#authorization-success-response).
