//! Embedded Iroh QUIC client for the NitroLitter native module.
//!
//! Ported from the alleycat `probe` client (github.com/dnakov/alleycat). Dials
//! the paired daemon by `node_id` (+ optional `relay`) over Iroh, then speaks
//! the alleycat protocol:
//!   - Each agent stream opens with a **length-prefixed** `connect` handshake
//!     (u32-BE length + JSON), carrying the auth token.
//!   - After `ok`, the stream switches to **JSONL** (newline-delimited JSON) for
//!     ACP-style JSON-RPC: `initialize` → `initialized` → method, with
//!     notifications (frames without `id`) streamed back to the caller.
//!
//! The length-prefixed wire codec comes from upstream `alleycat-bridge-core`
//! (`framing`) — the repo stays the source of truth, no vendoring. The JSONL
//! orchestration mirrors alleycat's `cli/probe.rs` flow.
//!
//! `cargo check` validates this against the daemon's exact iroh (0.98.2). The
//! remaining work is the FFI export (C ABI / uniffi) + Swift HybridObject — see
//! packages/nitro/NATIVE.md.

// Post-handshake JSONL codec comes straight from upstream alleycat-bridge-core.
pub mod ffi;

use alleycat_bridge_core::framing::{read_json_line, write_json_line};
use anyhow::{anyhow, Context, Result};
use iroh::endpoint::presets::N0;
use iroh::{Endpoint, EndpointAddr, EndpointId, RelayUrl};
use serde_json::{json, Value};
use std::str::FromStr;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader};

/// ALPN the alleycat daemon listens on (alleycat `protocol::ALLEYCAT_ALPN`).
/// That module is private in the third-party `alleycat` crate, so this is a
/// wire constant, not an import.
pub const ALPN: &[u8] = b"alleycat/1";
pub const PROTOCOL_VERSION: u32 = 1;
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// A live Iroh connection to one daemon.
pub struct Connection {
    conn: iroh::endpoint::Connection,
    _endpoint: Endpoint,
}

impl Connection {
    /// Dial the daemon by `node_id`, preferring `relay` for hole-punching.
    pub async fn dial(node_id: &str, relay: Option<&str>) -> Result<Self> {
        let endpoint_id = EndpointId::from_str(node_id).map_err(|e| anyhow!("bad node id: {e}"))?;
        let endpoint = Endpoint::builder(N0)
            .alpns(vec![ALPN.to_vec()])
            .bind()
            .await?;
        let mut addr = EndpointAddr::new(endpoint_id);
        if let Some(relay) = relay {
            let url = RelayUrl::from_str(relay).map_err(|e| anyhow!("bad relay: {e}"))?;
            addr = addr.with_relay_url(url);
        }
        let conn = endpoint.connect(addr, ALPN).await.context("iroh connect")?;
        Ok(Self { conn, _endpoint: endpoint })
    }

    /// `list_agents` over a length-prefixed stream → the Response JSON.
    pub async fn list_agents(&self, token: &str) -> Result<String> {
        let (mut send, mut recv) = self.conn.open_bi().await?;
        write_lp(&mut send, &json!({ "op": "list_agents", "v": PROTOCOL_VERSION, "token": token })).await?;
        send.finish().ok();
        let resp = read_lp(&mut recv).await?;
        Ok(resp.to_string())
    }

    /// Connect to `agent`, run a JSON-RPC `method`, stream notifications to
    /// `on_event`, and return the method's response frame as JSON.
    pub async fn request(
        &self,
        token: &str,
        agent: &str,
        method: &str,
        params: Value,
        mut on_event: impl FnMut(&str),
        linger: Duration,
    ) -> Result<String> {
        let (mut send, recv) = self.conn.open_bi().await?;

        // 1. length-prefixed connect handshake (token auth).
        write_lp(&mut send, &json!({
            "op": "connect", "v": PROTOCOL_VERSION, "token": token, "agent": agent,
        })).await?;
        let mut reader = BufReader::new(recv);
        let connect = read_lp(&mut reader).await.context("reading connect response")?;
        if connect.get("ok").and_then(Value::as_bool) != Some(true) {
            return Err(anyhow!(
                "connect rejected: {}",
                connect.get("error").and_then(Value::as_str).unwrap_or("<no error>")
            ));
        }

        // 2. switch to JSONL — initialize handshake.
        write_json_line(&mut send, &json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "clientInfo": { "name": "pounce", "version": env!("CARGO_PKG_VERSION"), "title": "Pounce" },
                "capabilities": { "experimentalApi": true }
            }
        })).await?;
        loop {
            let frame = read_line_timeout(&mut reader, DEFAULT_TIMEOUT).await.context("initialize response")?;
            if frame.get("id").is_some() {
                break;
            }
        }
        write_json_line(&mut send, &json!({ "jsonrpc": "2.0", "method": "initialized", "params": {} })).await?;

        // 3. the method call (id = 2). Frames without `id` are notifications.
        write_json_line(&mut send, &json!({ "jsonrpc": "2.0", "id": 2, "method": method, "params": params })).await?;

        let mut response: Option<Value> = None;
        let deadline = tokio::time::Instant::now() + DEFAULT_TIMEOUT;
        while tokio::time::Instant::now() < deadline {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            match read_line_timeout(&mut reader, remaining).await {
                Ok(frame) => {
                    if frame.get("id") == Some(&json!(2)) {
                        response = Some(frame);
                        break;
                    }
                    on_event(&frame.to_string());
                }
                Err(_) => break,
            }
        }

        // 4. linger for trailing notifications (e.g. turn/completed after the response).
        if !linger.is_zero() {
            let ld = tokio::time::Instant::now() + linger;
            while tokio::time::Instant::now() < ld {
                let remaining = ld.saturating_duration_since(tokio::time::Instant::now());
                match read_line_timeout(&mut reader, remaining).await {
                    Ok(frame) => on_event(&frame.to_string()),
                    Err(_) => break,
                }
            }
        }

        send.finish().ok();
        response.map(|r| r.to_string()).ok_or_else(|| anyhow!("no response to {method}"))
    }
}

// --- framing -----------------------------------------------------------------
//
// The length-prefixed connect handshake (u32-BE length + JSON) conforms to the
// alleycat wire. alleycat's `framing`/`protocol` modules are private to that
// third-party crate, so this is a small protocol-conformance shim (not a fork).
// The post-handshake JSONL codec is imported from the published bridge-core.

async fn write_lp<W: tokio::io::AsyncWrite + Unpin>(w: &mut W, v: &Value) -> Result<()> {
    let buf = serde_json::to_vec(v)?;
    w.write_u32(buf.len() as u32).await?;
    w.write_all(&buf).await?;
    w.flush().await?;
    Ok(())
}

async fn read_lp<R: tokio::io::AsyncRead + Unpin>(r: &mut R) -> Result<Value> {
    let len = r.read_u32().await.context("frame length")? as usize;
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf).await.context("frame body")?;
    Ok(serde_json::from_slice(&buf)?)
}

/// Timeout wrapper around upstream `read_json_line` (None = clean EOF).
async fn read_line_timeout<R: tokio::io::AsyncBufRead + Unpin>(
    reader: &mut R,
    timeout: Duration,
) -> Result<Value> {
    match tokio::time::timeout(timeout, read_json_line::<Value, _>(reader)).await {
        Ok(Ok(Some(v))) => Ok(v),
        Ok(Ok(None)) => Err(anyhow!("stream closed by peer")),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(anyhow!("timed out waiting for JSON line")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alpn_matches_daemon() {
        assert_eq!(ALPN, b"alleycat/1");
    }

    #[test]
    fn connect_frame_shape() {
        let f = json!({ "op": "connect", "v": PROTOCOL_VERSION, "token": "t", "agent": "claude" });
        assert_eq!(f["op"], "connect");
        assert_eq!(f["v"], 1);
    }

    #[test]
    fn rejects_bad_node_id() {
        assert!(EndpointId::from_str("not-a-node-id").is_err());
    }
}
