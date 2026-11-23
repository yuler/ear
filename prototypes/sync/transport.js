// PROTOTYPE. Transport seam: how a phone reaches the PC library.
//
// Only "lan" exists today: the phone talks straight to the PC's address from the QR code.
// TODO(relay): custom relay server, configured by the user, for when phone and PC are not
// on the same network. Not shown in the UI yet. Add a `relay` entry with the same shape and
// let createTransport() pick it (e.g. from a hidden setting). Pairing payload already carries
// `transport` so old QR codes keep working.

/**
 * @typedef {Object} Transport
 * @property {"lan" | "relay"} kind
 * @property {(pc: {ip: string, port: number}) => string} address  Where the phone connects.
 * @property {(pc: {ip: string, port: number}, code: string) => string} pairUrl  QR payload.
 * @property {number} mbps  Simulated throughput per file.
 */

/** @type {Record<string, Transport>} */
const TRANSPORTS = {
  lan: {
    kind: "lan",
    address: (pc) => `${pc.ip}:${pc.port}`,
    pairUrl: (pc, code) =>
      `ear://pair?transport=lan&host=${pc.ip}&port=${pc.port}&code=${code}`,
    mbps: 18,
  },
  // relay: { kind: "relay", address: ..., pairUrl: ..., mbps: ... },  // TODO(relay)
};

/** @param {"lan" | "relay"} [kind] */
function createTransport(kind = "lan") {
  const t = TRANSPORTS[kind];
  if (!t) throw new Error(`TODO(relay): transport "${kind}" is not implemented`);
  return t;
}
