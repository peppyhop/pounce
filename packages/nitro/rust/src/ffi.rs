//! C ABI over `Connection`, called from the Swift `HybridNitroLitter`.
//!
//! Everything crosses as UTF-8 C strings of JSON (matching NitroLitter.nitro.ts,
//! which passes @litter/shared types as JSON). A process-wide tokio runtime
//! drives the async iroh client; connections live in a handle registry.
//!
//! Ownership: every `*mut c_char` returned here is heap-allocated by Rust and
//! MUST be freed by the caller via `litter_string_free`.

use crate::Connection;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::ffi::{c_char, c_void, CStr, CString};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::runtime::Runtime;

static RT: Lazy<Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("tokio runtime")
});

static CONNS: Lazy<Mutex<HashMap<u64, Arc<Connection>>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static NEXT_HANDLE: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(1));

/// Streamed-notification callback: `(ctx, json_cstr)`. The pointer is only valid
/// for the duration of the call — copy it on the Swift side.
pub type EventCb = extern "C" fn(ctx: *mut c_void, json: *const c_char);

fn cstr<'a>(p: *const c_char) -> Option<&'a str> {
    if p.is_null() {
        return None;
    }
    unsafe { CStr::from_ptr(p) }.to_str().ok()
}

fn out(s: String) -> *mut c_char {
    CString::new(s).unwrap_or_default().into_raw()
}

fn err_json(msg: impl std::fmt::Display) -> *mut c_char {
    out(serde_json::json!({ "error": msg.to_string() }).to_string())
}

/// Dial a daemon. Returns a connection handle (0 = failure).
#[no_mangle]
pub extern "C" fn litter_connect(node_id: *const c_char, relay: *const c_char) -> u64 {
    let Some(node_id) = cstr(node_id) else { return 0 };
    let relay = cstr(relay).filter(|s| !s.is_empty());
    match RT.block_on(Connection::dial(node_id, relay)) {
        Ok(conn) => {
            let mut next = NEXT_HANDLE.lock().unwrap();
            let handle = *next;
            *next += 1;
            CONNS.lock().unwrap().insert(handle, Arc::new(conn));
            handle
        }
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "C" fn litter_disconnect(handle: u64) {
    CONNS.lock().unwrap().remove(&handle);
}

fn conn_for(handle: u64) -> Option<Arc<Connection>> {
    CONNS.lock().unwrap().get(&handle).cloned()
}

/// `list_agents` → Response JSON (or `{"error":...}`). Caller frees the result.
#[no_mangle]
pub extern "C" fn litter_list_agents(handle: u64, token: *const c_char) -> *mut c_char {
    let (Some(conn), Some(token)) = (conn_for(handle), cstr(token)) else {
        return err_json("invalid handle or token");
    };
    match RT.block_on(conn.list_agents(token)) {
        Ok(json) => out(json),
        Err(e) => err_json(e),
    }
}

/// Run a JSON-RPC `method` on `agent`. Notifications are delivered to `cb`
/// during the call; returns the method's response frame JSON. Caller frees it.
#[no_mangle]
pub extern "C" fn litter_request(
    handle: u64,
    token: *const c_char,
    agent: *const c_char,
    method: *const c_char,
    params_json: *const c_char,
    cb: Option<EventCb>,
    ctx: *mut c_void,
    linger_ms: u64,
) -> *mut c_char {
    let (Some(conn), Some(token), Some(agent), Some(method)) =
        (conn_for(handle), cstr(token), cstr(agent), cstr(method))
    else {
        return err_json("invalid handle/args");
    };
    let params: serde_json::Value = cstr(params_json)
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| serde_json::json!({}));

    // Raw ctx is shared with the callback, invoked synchronously on this thread.
    let ctx_addr = ctx as usize;
    let on_event = move |json: &str| {
        if let Some(cb) = cb {
            if let Ok(c) = CString::new(json) {
                cb(ctx_addr as *mut c_void, c.as_ptr());
            }
        }
    };

    match RT.block_on(conn.request(token, agent, method, params, on_event, Duration::from_millis(linger_ms))) {
        Ok(json) => out(json),
        Err(e) => err_json(e),
    }
}

/// Free a string previously returned by this library.
#[no_mangle]
pub extern "C" fn litter_string_free(s: *mut c_char) {
    if !s.is_null() {
        unsafe { drop(CString::from_raw(s)) };
    }
}
