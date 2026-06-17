// C ABI for the litter-iroh static lib (see src/ffi.rs).
// Imported by the Swift HybridNitroLitter via the xcframework module map.
#ifndef LITTER_IROH_H
#define LITTER_IROH_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Streamed-notification callback. `json` is valid only for the call's duration.
typedef void (*litter_event_cb)(void *ctx, const char *json);

// Dial a daemon by node id (+ optional relay URL). Returns a handle, 0 = error.
uint64_t litter_connect(const char *node_id, const char *relay);

// Drop a connection.
void litter_disconnect(uint64_t handle);

// list_agents -> Response JSON. Caller frees via litter_string_free.
char *litter_list_agents(uint64_t handle, const char *token);

// Run a JSON-RPC method on an agent; notifications go to `cb` during the call.
// Returns the response frame JSON. Caller frees via litter_string_free.
char *litter_request(uint64_t handle,
                     const char *token,
                     const char *agent,
                     const char *method,
                     const char *params_json,
                     litter_event_cb cb,
                     void *ctx,
                     uint64_t linger_ms);

// Free a string returned by this library.
void litter_string_free(char *s);

#ifdef __cplusplus
}
#endif

#endif // LITTER_IROH_H
