const vm = require('vm');
const axios = require('axios');

class JavaScriptChallenge {
  constructor() {
    this.source = null;
    this.functionName = null;
    this.timestamp = null;
    this.cache = new Map();
    this.prepared = false;
  }

  // Kotlin regexes verbatim (ported)
  static get REGEXES() {
    return [
      /\bm=([a-zA-Z0-9$]{2,})\(decodeURIComponent\(h\.s\)\)/,
      /\bc&&\(c=([a-zA-Z0-9$]{2,})\(decodeURIComponent\(c\)\)/,
      /(?:\b|[^a-zA-Z0-9$])([a-zA-Z0-9$]{2,})\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)/,
      /([\w$]+)\s*=\s*function\((\w+)\)\{\s*\2=\s*\2\.split\(\"\"\)\s*;/
    ];
  }

  sanitizeSource(src) {
    return src
      .replace(/document\.location\.hostname/g, '"youtube.com"')
      .replace(/window\.location\.hostname/g, '"youtube.com"')
      .replace(/XMLHttpRequest\.prototype\.fetch/g, 'undefined')
      .replace(/new XMLHttpRequest\(/g, 'undefined');
  }

  async prepare({ source, timestamp }) {
    if (!source) throw new Error('no source');
    this.source = this.sanitizeSource(source);
    this.timestamp = timestamp || null;

    // find function name via regexes
    for (const r of JavaScriptChallenge.REGEXES) {
      const m = r.exec(this.source);
      if (m && m[1]) {
        this.functionName = m[1];
        break;
      }
    }

    if (!this.functionName) {
      // fallback heuristics
      const fb = /function\s+([A-Za-z0-9$]{2,})\s*\(\w+\)\s*\{\w+\.split\(\"\"\)/.exec(this.source);
      if (fb && fb[1]) this.functionName = fb[1];
    }

    this.prepared = true;
  }

  async decode(cipher) {
    if (!cipher) return null;
    if (this.cache.has(cipher)) return this.cache.get(cipher);
    if (!this.prepared) throw new Error('No JS source loaded');

    const sandbox = {
      window: {},
      document: {},
      XMLHttpRequest: undefined,
      atob: (v) => Buffer.from(v, 'base64').toString('binary'),
      navigator: {}
    };
    const ctx = vm.createContext(sandbox);
    try {
      // run the player source
      new vm.Script(this.source).runInContext(ctx, { timeout: 2000 });

      // function may be global or nested on an object. try global first
      let fn = ctx[this.functionName];
      if (typeof fn !== 'function') {
        // try to find it on global properties
        for (const k of Object.keys(ctx)) {
          try {
            if (typeof ctx[k] === 'object' || typeof ctx[k] === 'function') {
              const obj = ctx[k];
              if (obj && typeof obj[this.functionName] === 'function') {
                fn = obj[this.functionName].bind(obj);
                break;
              }
            }
          } catch (e) {}
        }
      }

      if (typeof fn !== 'function') {
        // try to evaluate a wrapper to call the function by name (might be nested)
        const wrapper = `
          (function(s){
            try {
              if (typeof ${this.functionName} === "function") return ${this.functionName}(s);
            } catch(e){}
            return null;
          })
        `;
        const wrapped = vm.runInContext(wrapper, ctx);
        const result = wrapped(cipher);
        if (typeof result === 'string') {
          this.cache.set(cipher, result);
          return result;
        }
        throw new Error('Decipher function not found');
      }

      const res = fn(cipher);
      this.cache.set(cipher, res);
      return res;
    } catch (err) {
      throw new Error('Decipher failed: ' + (err && err.message));
    }
  }
}

module.exports = new JavaScriptChallenge();
