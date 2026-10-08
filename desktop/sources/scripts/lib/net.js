'use strict'

// ---------------------------------------------------------------------------
// Net — rete del renderer con timeout, annullamento per canale e stato busy.
// Nessuna dipendenza: usa solo window.fetch (sandbox, contextIsolation).
//
//   Net.fetch(url, opts, ms)   -> Response, abortita dopo `ms` (default 4000)
//   Net.json(url, opts, ms)    -> oggetto JSON (throw su !ok)
//   Net.bytes(url, opts, ms)   -> Uint8Array
//   Net.begin('bg')            -> nuovo AbortController di canale (annulla il precedente)
//   Net.stale('bg', signal)    -> true se nel frattempo il canale e' stato rilanciato
//   Net.onChange(fn)           -> fn(pending) a ogni richiesta iniziata/finita
// ---------------------------------------------------------------------------

const Net = {
  DEFAULT_TIMEOUT: 4000,
  JSON_TIMEOUT: 5000,

  channels: new Map(),
  stats: { ok: 0, timeout: 0, abort: 0, error: 0 },

  _pending: 0,
  _listeners: [],

  // --- stato busy (per l'indicatore in terminale) -------------------------
  pending() { return this._pending },
  busy() { return this._pending > 0 },
  onChange(fn) { if (typeof fn === 'function') { this._listeners.push(fn) } },
  _emit() {
    for (let i = 0; i < this._listeners.length; i++) {
      try { this._listeners[i](this._pending) } catch (e) {}
    }
  },
  _start() { this._pending++; this._emit() },
  _end() { this._pending = Math.max(0, this._pending - 1); this._emit() },

  // --- canali -------------------------------------------------------------
  begin(channel) {
    this.cancel(channel)
    const ctl = new AbortController()
    this.channels.set(channel, ctl)
    return ctl
  },
  controller(channel) { return this.channels.get(channel) || null },
  cancel(channel) {
    const c = this.channels.get(channel)
    if (c) { try { c.abort() } catch (e) {} }
  },
  end(channel) { this.channels.delete(channel) },

  // Una risposta e' stale se il canale e' stato rilanciato (o chiuso) dopo la partenza.
  stale(channel, signal) {
    const cur = this.channels.get(channel)
    if (!cur) { return true }
    if (signal && cur.signal !== signal) { return true }
    return false
  },

  // --- primitive ----------------------------------------------------------
  fetch(url, opts, timeoutMs) {
    opts = opts || {}
    const ms = timeoutMs || opts.timeout || this.DEFAULT_TIMEOUT
    const outer = opts.signal
    // quiet:true = richiesta di background (prefetch). Non entra in Net.busy(),
    // così l'indicatore di caricamento e il ridisegno UI non la considerano.
    const quiet = !!opts.quiet
    const out = {}
    for (const k in opts) { if (k !== 'timeout' && k !== 'quiet') { out[k] = opts[k] } }

    const ctl = new AbortController()
    let settled = false
    const timer = setTimeout(() => { try { ctl.abort() } catch (e) {} }, ms)
    const onOuter = () => { try { ctl.abort() } catch (e) {} }
    if (outer) {
      if (outer.aborted) { onOuter() } else { outer.addEventListener('abort', onOuter, { once: true }) }
    }
    out.signal = ctl.signal

    if (!quiet) { this._start() }
    const done = () => {
      if (settled) { return }
      settled = true
      clearTimeout(timer)
      if (outer) { try { outer.removeEventListener('abort', onOuter) } catch (e) {} }
      if (!quiet) { this._end() }
    }

    return fetch(url, out).then(
      (res) => { done(); this.stats.ok++; return res },
      (err) => {
        done()
        const name = err && err.name
        if (name === 'AbortError') {
          if (outer && outer.aborted) {
            this.stats.abort++
            const e = new Error('annullato')
            e.name = 'AbortError'; e.reason = 'channel'; e.url = url
            throw e
          }
          this.stats.timeout++
          const e = new Error('timeout ' + ms + 'ms')
          e.name = 'TimeoutError'; e.reason = 'timeout'; e.url = url
          throw e
        }
        this.stats.error++
        throw err
      }
    )
  },

  json(url, opts, timeoutMs) {
    return this.fetch(url, opts, timeoutMs || this.JSON_TIMEOUT).then((r) => {
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; e.url = url; throw e }
      return r.json()
    })
  },

  text(url, opts, timeoutMs) {
    return this.fetch(url, opts, timeoutMs || this.JSON_TIMEOUT).then((r) => {
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; e.url = url; throw e }
      return r.text()
    })
  },

  bytes(url, opts, timeoutMs) {
    return this.fetch(url, opts, timeoutMs).then((r) => {
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; e.url = url; throw e }
      return r.arrayBuffer().then((ab) => new Uint8Array(ab))
    })
  },

  // --- cache persistente --------------------------------------------------
  // localStorage da solo NON basta: su origine file:// (Electron) non viene
  // scritto su disco, quindi la cache spariva a ogni avvio. La versione
  // affidabile è cacheLoad/cacheSave: localStorage per la sessione corrente +
  // userData/cache/<key>.json via IPC per la persistenza vera.
  cacheGet(key, ttlMs) {
    try {
      const raw = window.localStorage.getItem('net_cache_' + key)
      if (!raw) { return null }
      const box = JSON.parse(raw)
      if (!box || !box.t || !box.v) { return null }
      if (ttlMs && (Date.now() - box.t) > ttlMs) { return null }
      return box.v
    } catch (e) { return null }
  },

  cacheSet(key, value) {
    try {
      window.localStorage.setItem('net_cache_' + key, JSON.stringify({ t: Date.now(), v: value }))
      return true
    } catch (e) { return false }
  },

  cacheAge(key) {
    if (this._diskT && this._diskT[key]) { return Date.now() - this._diskT[key] }
    try {
      const raw = window.localStorage.getItem('net_cache_' + key)
      if (!raw) { return -1 }
      const box = JSON.parse(raw)
      return box && box.t ? (Date.now() - box.t) : -1
    } catch (e) { return -1 }
  },

  _diskT: {},

  // Legge dalla cache (memoria → disco). Ritorna il valore o null.
  async cacheLoad(key, ttlMs) {
    const mem = this.cacheGet(key, ttlMs)
    if (mem) { return mem }
    if (window.api && window.api.cache) {
      try {
        const box = await window.api.cache.get(key)
        if (box && box.t && box.v) {
          this._diskT[key] = box.t
          if (ttlMs && (Date.now() - box.t) > ttlMs) { return null }
          this.cacheSet(key, box.v) // riscalda localStorage per questa sessione
          return box.v
        }
      } catch (e) {}
    }
    return null
  },

  // Scrive su disco (e in localStorage). Ritorna true se almeno una è andata a buon fine.
  async cacheSave(key, value) {
    const mem = this.cacheSet(key, value)
    let disk = false
    if (window.api && window.api.cache) {
      try {
        disk = await window.api.cache.set(key, value)
        if (disk) { this._diskT[key] = Date.now() } else { console.warn('[Net] cache:set rifiutato per ' + key) }
      } catch (e) { console.warn('[Net] cache:set errore:', (e && e.message) || e) }
    } else {
      console.warn('[Net] cache su disco non disponibile (window.api.cache assente)')
    }
    return mem || disk
  },

  async cacheDrop(key) {
    try { window.localStorage.removeItem('net_cache_' + key) } catch (e) {}
    if (window.api && window.api.cache) {
      try { await window.api.cache.del(key) } catch (e) {}
    }
  }
}

window.Net = Net
