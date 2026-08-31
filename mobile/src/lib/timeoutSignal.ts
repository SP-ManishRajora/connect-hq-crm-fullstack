// AbortSignal.timeout() is not implemented in Hermes, the engine the Android
// build runs on: calling it throws "AbortSignal.timeout is not a function"
// before fetch is ever reached, which surfaces to the user as a connection
// failure against a server that is in fact perfectly reachable.
//
// AbortController itself is available, so the timeout is driven by a timer that
// is cleared once the caller settles the request.
export function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => {
    // signIn() distinguishes a timeout from other transport failures by the
    // error's name, which is what AbortSignal.timeout() would have produced.
    const err = new Error("The request timed out.");
    err.name = "TimeoutError";
    controller.abort(err);
  }, ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}
