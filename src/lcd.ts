/**
 * Server-side chain access for the explorer pages.
 *
 * Everything here talks to localhost only: the LCD (127.0.0.1:1317) and the
 * CometBFT RPC (CONFIG.node). Nothing on this host is exposed to the internet
 * for the explorer's sake — the Express server is the only public surface,
 * and it sits behind Cloudflare.
 */
import * as crypto from "crypto";
import { CONFIG } from "./config";

const LCD = "http://127.0.0.1:1317";

function rpcBase(): string {
  // CONFIG.node is tcp://127.0.0.1:37657
  return CONFIG.node.replace(/^tcp:\/\//, "http://");
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${url.split("?")[0]} -> HTTP ${res.status}`);
  return res.json();
}

export const lcd = (path: string) => getJson(LCD + path);
export const rpc = (path: string) => getJson(rpcBase() + path).then((d) => d.result ?? d);

/* ── bech32 (BIP-173), enough to re-encode address payloads ─────────────── */

const B32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function polymod(v: number[]): number {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let c = 1;
  for (const d of v) {
    const b = c >>> 25;
    c = ((c & 0x1ffffff) << 5) ^ d;
    for (let i = 0; i < 5; i++) if ((b >>> i) & 1) c ^= G[i];
  }
  return c;
}
const hrpExpand = (h: string) => [...h].map((c) => c.charCodeAt(0) >>> 5).concat([0], [...h].map((c) => c.charCodeAt(0) & 31));

function toWords(bytes: Buffer): number[] {
  let acc = 0, bits = 0;
  const out: number[] = [];
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; out.push((acc >>> bits) & 31); }
  }
  if (bits) out.push((acc << (5 - bits)) & 31);
  return out;
}
function fromWords(words: number[]): Buffer {
  let acc = 0, bits = 0;
  const out: number[] = [];
  for (const w of words) {
    acc = (acc << 5) | w; bits += 5;
    while (bits >= 8) { bits -= 8; out.push((acc >>> bits) & 0xff); }
  }
  return Buffer.from(out);
}

export function bech32Encode(hrp: string, data: Buffer): string {
  const words = toWords(data);
  const chk = polymod(hrpExpand(hrp).concat(words, [0, 0, 0, 0, 0, 0])) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (chk >>> (5 * (5 - i))) & 31);
  return hrp + "1" + words.concat(checksum).map((w) => B32[w]).join("");
}

export function bech32Decode(addr: string): { hrp: string; data: Buffer } | null {
  const pos = addr.lastIndexOf("1");
  if (pos < 1) return null;
  const hrp = addr.slice(0, pos).toLowerCase();
  const words = [...addr.slice(pos + 1).toLowerCase()].map((c) => B32.indexOf(c));
  if (words.includes(-1)) return null;
  if (polymod(hrpExpand(hrp).concat(words)) !== 1) return null;
  return { hrp, data: fromWords(words.slice(0, -6)) };
}

/** All four representations of a validator's identity, derived, not queried. */
export function addressForms(valoper: string, consensusPubkeyB64?: string | null) {
  const dec = bech32Decode(valoper);
  const out: Record<string, string | null> = {
    operator: valoper, account: null, consensus: null, hex: null,
  };
  if (dec) {
    // lava@valoper1... -> lava@1...  (same payload, account HRP)
    const hrp = dec.hrp.replace(/valoper$/, "");
    out.account = bech32Encode(hrp, dec.data);
  }
  if (consensusPubkeyB64) {
    const raw = crypto.createHash("sha256").update(Buffer.from(consensusPubkeyB64, "base64")).digest().subarray(0, 20);
    out.hex = raw.toString("hex").toUpperCase();
    if (dec) out.consensus = bech32Encode(dec.hrp.replace(/valoper$/, "") + "valcons", raw);
  }
  return out;
}

/* ── caches ──────────────────────────────────────────────────────────────── */

type Cached<T> = { at: number; value: T };
const caches = new Map<string, Cached<any>>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = caches.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  caches.set(key, { at: Date.now(), value });
  return value;
}

/** valoper -> { moniker, consensus hex } for the whole set, 5 min TTL. */
export async function validatorDirectory(): Promise<Map<string, { moniker: string; hex: string | null; valoper: string }>> {
  return cached("valdir", 5 * 60_000, async () => {
    const d = await lcd("/cosmos/staking/v1beta1/validators?pagination.limit=500");
    const map = new Map<string, { moniker: string; hex: string | null; valoper: string }>();
    for (const v of d.validators ?? []) {
      const key = v.consensus_pubkey?.key ?? null;
      const hex = key
        ? crypto.createHash("sha256").update(Buffer.from(key, "base64")).digest().subarray(0, 20).toString("hex").toUpperCase()
        : null;
      const entry = { moniker: v.description?.moniker ?? v.operator_address, hex, valoper: v.operator_address };
      map.set(v.operator_address, entry);
      if (hex) map.set(hex, entry);
    }
    return map;
  });
}

/** Recent block headers straight from CometBFT, one call. */
export async function recentBlocks(limit: number): Promise<any[]> {
  const status = await rpc("/status");
  const top = Number(status.sync_info.latest_block_height);
  const d = await rpc(`/blockchain?minHeight=${top - limit + 1}&maxHeight=${top}`);
  return (d.block_metas ?? []).sort((a: any, b: any) => Number(b.header.height) - Number(a.header.height));
}

/**
 * Signing matrix: for the last N blocks, every validator's block_id_flag,
 * positionally matched against the validator set (ABSENT entries carry an
 * empty address in the commit — the lesson that broke our first measurement).
 * One build serves every page for 60 seconds.
 */
export async function signingMatrix(blocks = 70): Promise<{ from: number; to: number; byHex: Map<string, number[]> }> {
  return cached("sigmatrix", 60_000, async () => {
    const status = await rpc("/status");
    const top = Number(status.sync_info.latest_block_height) - 1;
    const from = top - blocks + 1;

    let order: string[] = [];
    let orderHash = "";
    const byHex = new Map<string, number[]>();

    for (let h = from; h <= top; h++) {
      try {
        const c = await rpc(`/commit?height=${h}`);
        const hdr = c.signed_header.header;
        if (hdr.validators_hash !== orderHash) {
          const vals: string[] = [];
          let page = 1;
          for (;;) {
            const v = await rpc(`/validators?height=${h}&per_page=100&page=${page}`);
            for (const x of v.validators) vals.push(String(x.address).toUpperCase());
            if (vals.length >= Number(v.total)) break;
            page++;
          }
          order = vals;
          orderHash = hdr.validators_hash;
        }
        const sigs = c.signed_header.commit.signatures as any[];
        if (sigs.length !== order.length) continue;
        for (let i = 0; i < order.length; i++) {
          const arr = byHex.get(order[i]) ?? [];
          arr.push(Number(sigs[i].block_id_flag));
          byHex.set(order[i], arr);
        }
      } catch { /* skip a block rather than fail the whole matrix */ }
    }
    return { from, to: top, byHex };
  });
}

/** Decoded transactions of one block via LCD, hashes recomputed from RPC bytes. */
export async function blockTransactions(height: number): Promise<any[]> {
  const [decoded, raw] = await Promise.all([
    lcd(`/cosmos/tx/v1beta1/txs/block/${height}?pagination.limit=100`),
    rpc(`/block?height=${height}`),
  ]);
  const rawTxs: string[] = raw.block?.data?.txs ?? [];
  const txs = decoded.txs ?? [];
  return txs.map((tx: any, i: number) => {
    const hash = rawTxs[i]
      ? crypto.createHash("sha256").update(Buffer.from(rawTxs[i], "base64")).digest("hex").toUpperCase()
      : null;
    const msgs = (tx.body?.messages ?? []).map((m: any) =>
      String(m["@type"] ?? "unknown").split(".").pop()!.replace(/^Msg/, ""));
    const fee = (tx.auth_info?.fee?.amount ?? [])
      .map((a: any) => `${(Number(a.amount) / 1e6).toFixed(4)} ${String(a.denom).replace(/^u/, "").toUpperCase()}`)
      .join(", ");
    return { hash, height, msgs, fee, memo: tx.body?.memo ?? "" };
  });
}

export async function chainOverview(): Promise<any> {
  return cached("overview", 60_000, async () => {
    const [pool, status] = await Promise.all([
      lcd("/cosmos/staking/v1beta1/pool"),
      rpc("/status"),
    ]);
    return {
      height: Number(status.sync_info.latest_block_height),
      block_time: status.sync_info.latest_block_time,
      bonded: Number(pool.pool?.bonded_tokens ?? 0) / 1e6,
      not_bonded: Number(pool.pool?.not_bonded_tokens ?? 0) / 1e6,
    };
  });
}
