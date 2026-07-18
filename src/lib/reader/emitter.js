// Minimal event-emitter shared by both reader engines.
// Lives in its own module so readerEngine.js (which imports the engines) and the
// engines (which need Emitter) don't form a circular import.
export class Emitter {
  constructor() {
    this._listeners = {}
  }
  on(event, cb) {
    ;(this._listeners[event] ||= new Set()).add(cb)
    return () => this.off(event, cb)
  }
  off(event, cb) {
    this._listeners[event]?.delete(cb)
  }
  emit(event, payload) {
    this._listeners[event]?.forEach((cb) => {
      try {
        cb(payload)
      } catch (err) {
        console.error(`listener for ${event} threw`, err)
      }
    })
  }
}
