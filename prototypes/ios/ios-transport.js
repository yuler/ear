// PROTOTYPE. Transport seam: how the phone (client) reaches the Mac (server).
//
// Only "lan" exists: the phone connects straight to the address in the Mac's QR code.
// TODO(relay): user-configured custom relay server, for when phone and Mac are not on the
// same network. Not shown in the UI yet. Add a `relay` entry with the same shape and let
// createTransport() choose it (e.g. from a hidden setting). The QR payload already carries
// `transport=` so codes printed today keep working after relay lands.

/**
 * @typedef {Object} Transport
 * @property {"lan" | "relay"} kind
 * @property {(mac: {ip: string, port: number}) => string} address
 * @property {(mac: {ip: string, port: number}, code: string) => string} pairUrl  QR payload
 * @property {number} mbps  Simulated throughput per file
 */

/** @type {Record<string, Transport>} */
const TRANSPORTS = {
  lan: {
    kind: "lan",
    address: (mac) => `${mac.ip}:${mac.port}`,
    pairUrl: (mac, code) => `ear://pair?transport=lan&host=${mac.ip}&port=${mac.port}&code=${code}`,
    mbps: 14,
  },
  // relay: { kind: "relay", address: ..., pairUrl: ..., mbps: ... },  // TODO(relay)
};

/** @param {"lan" | "relay"} [kind] */
function createTransport(kind = "lan") {
  const t = TRANSPORTS[kind];
  if (!t) throw new Error(`TODO(relay): transport "${kind}" is not implemented`);
  return t;
}
