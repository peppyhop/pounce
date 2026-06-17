//
//  HybridNitroLitter.swift — Swift side of the NitroLitter HybridObject.
//
//  Bridges the Nitrogen-generated `HybridNitroLitterSpec` to the litter-iroh
//  Rust static lib (C ABI, imported as the `LitterIroh` module from the
//  vendored xcframework). Everything crosses as JSON strings, matching
//  NitroLitter.nitro.ts.
//
//  The Rust client is blocking (block_on); calls hop to a work queue so the
//  returned Promises don't stall the JS thread.
//
import Foundation
import NitroModules
import LitterIroh  // the Rust C ABI, vendored as a static framework (see NitroLitter.podspec)

private let workQueue = DispatchQueue(label: "com.pounce.iroh", qos: .userInitiated)

final class HybridNitroLitter: HybridNitroLitterSpec {
  private var handle: UInt64 = 0
  private var token: String = ""
  private var stateListeners: [(String) -> Void] = []

  // MARK: lifecycle

  func connect(pairPayloadJson: String) throws -> Promise<String> {
    return Promise.async {
      let pair = try? JSONSerialization.jsonObject(with: Data(pairPayloadJson.utf8)) as? [String: Any]
      let nodeId = (pair?["nodeId"] as? String) ?? ""
      let relay = (pair?["relay"] as? String) ?? ""
      self.token = (pair?["token"] as? String) ?? ""

      let h: UInt64 = await withCheckedContinuation { cont in
        workQueue.async {
          let h = nodeId.withCString { nid in
            relay.withCString { rl in litter_connect(nid, relay.isEmpty ? nil : rl) }
          }
          cont.resume(returning: h)
        }
      }
      guard h != 0 else { throw RuntimeError.error(withMessage: "iroh connect failed") }
      self.handle = h
      self.notifyState("connected")
      return "{\"connected\":true}"
    }
  }

  func disconnect() throws -> Promise<Void> {
    return Promise.async {
      let h = self.handle
      self.handle = 0
      if h != 0 { workQueue.async { litter_disconnect(h) } }
      self.notifyState("disconnected")
    }
  }

  func getConnectionState() throws -> String {
    return handle != 0 ? "connected" : "disconnected"
  }

  func onConnectionStateChange(listener: @escaping (_ state: String) -> Void) throws -> () -> Void {
    stateListeners.append(listener)
    let index = stateListeners.count - 1
    return { [weak self] in
      if let self = self, index < self.stateListeners.count {
        self.stateListeners.remove(at: index)
      }
    }
  }

  private func notifyState(_ s: String) {
    for l in stateListeners { l(s) }
  }

  // MARK: agents / turns (wired to the Iroh client)

  func listAgents() throws -> Promise<String> {
    return Promise.async {
      let h = self.handle
      guard h != 0 else { throw RuntimeError.error(withMessage: "not connected") }
      return await withCheckedContinuation { cont in
        workQueue.async {
          let r = self.token.withCString { tk in litter_list_agents(h, tk) }
          defer { if let r = r { litter_string_free(r) } }
          cont.resume(returning: r.map { String(cString: $0) } ?? "{\"agents\":[]}")
        }
      }
    }
  }

  func sendMessage(inputJson: String) throws -> Promise<String> {
    return runMethod(agent: agentFrom(inputJson), method: "turn/start", paramsJson: inputJson)
  }

  func createTask(requestJson: String) throws -> Promise<String> {
    return runMethod(agent: agentFrom(requestJson), method: "turn/start", paramsJson: requestJson)
  }

  // MARK: not-yet-over-Iroh (the app uses the HTTP bridge for these today)

  func createProject(inputJson: String) throws -> Promise<String> { notImpl() }
  func openProject(hostId: String, path: String) throws -> Promise<String> { notImpl() }
  func createConversation(projectId: String, agent: String) throws -> Promise<String> { notImpl() }
  func deleteConversation(conversationId: String) throws -> Promise<Void> { notImplVoid() }
  func pauseTask(runId: String) throws -> Promise<Void> { notImplVoid() }
  func resumeTask(runId: String) throws -> Promise<Void> { notImplVoid() }
  func cancelTask(runId: String) throws -> Promise<Void> { notImplVoid() }
  func getRepositories(hostId: String) throws -> Promise<String> { notImpl() }
  func getGitStatus(requestJson: String) throws -> Promise<String> { notImpl() }
  func getDiff(requestJson: String) throws -> Promise<String> { notImpl() }
  func commit(requestJson: String) throws -> Promise<Void> { notImplVoid() }
  func createTerminal(requestJson: String, onData: @escaping (_ chunkJson: String) -> Void) throws -> Promise<String> { notImpl() }
  func executeCommand(terminalId: String, command: String) throws -> Promise<Void> { notImplVoid() }
  func resizeTerminal(terminalId: String, cols: Double, rows: Double) throws -> Promise<Void> { notImplVoid() }
  func closeTerminal(terminalId: String) throws -> Promise<Void> { notImplVoid() }

  // subscribe/watch: streaming over Iroh is future work (timeline uses the
  // bridge today). Return inert subscription ids so callers stay happy.
  func subscribe(conversationId: String, sinceSeq: Double, onEvent: @escaping (_ envelopeJson: String) -> Void, onError: @escaping (_ message: String) -> Void) throws -> String {
    return "sub:\(conversationId)"
  }
  func unsubscribe(subscriptionId: String) throws { }
  func watchRepository(cwd: String, onChange: @escaping (_ pathsJson: String) -> Void) throws -> String { return "watch:\(cwd)" }
  func unwatchRepository(watchId: String) throws { }

  // MARK: helpers

  private func runMethod(agent: String, method: String, paramsJson: String) -> Promise<String> {
    return Promise.async {
      let h = self.handle
      guard h != 0 else { throw RuntimeError.error(withMessage: "not connected") }
      let token = self.token
      return await withCheckedContinuation { cont in
        workQueue.async {
          let result = token.withCString { tk in
            agent.withCString { ag in
              method.withCString { mt in
                paramsJson.withCString { pj in
                  litter_request(h, tk, ag, mt, pj, nil, nil, 0)
                }
              }
            }
          }
          defer { if let result = result { litter_string_free(result) } }
          cont.resume(returning: result.map { String(cString: $0) } ?? "{\"error\":\"null\"}")
        }
      }
    }
  }

  private func notImpl() -> Promise<String> {
    Promise.async { throw RuntimeError.error(withMessage: "not implemented over Iroh yet") }
  }
  private func notImplVoid() -> Promise<Void> {
    Promise.async { throw RuntimeError.error(withMessage: "not implemented over Iroh yet") }
  }

  private func agentFrom(_ json: String) -> String {
    let obj = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any]
    if let agent = obj?["agent"] as? String { return agent }
    let convo = obj?["conversation"] as? [String: Any]
    return (convo?["agent"] as? String) ?? ""
  }
}
