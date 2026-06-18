/** @type {import('@bacons/apple-targets').Config} */
// ReplyDeck lock-screen + home-screen widget target.
// The widget fetches pending cards directly from the API over the network,
// so it needs no app-group/data-sharing entitlement for v1 — keeping the
// provisioning profile minimal for a clean first EAS build.
module.exports = {
  type: "widget",
  // iOS 17 enables interactive Button(intent:) — the one-tap Send action.
  deploymentTarget: "17.0",
};
