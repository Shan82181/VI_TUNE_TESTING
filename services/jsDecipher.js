const vm = require("vm");

class JsDecipher {
  constructor() {
    this.ready = false;
    this.fnName = null;
    this.source = null;
  }

  prepareFromSource(jsCode) {
    this.source = jsCode;

    const regexes = [
      /\bm=([a-zA-Z0-9$]{2,})\(decodeURIComponent\(h\.s\)\)/,
      /\bc&&\(c=([a-zA-Z0-9$]{2,})\(decodeURIComponent\(c\)\)\)/,
      /(?:\b|[^a-zA-Z0-9$])([a-zA-Z0-9$]{2,})\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)/,
      /([\w$]+)\s*=\s*function\((\w+)\)\{\s*\2=\s*\2\.split\(""\)\s*;/
    ];

    for (const r of regexes) {
      const match = r.exec(jsCode);
      if (match) {
        this.fnName = match[1];
        break;
      }
    }

    if (!this.fnName) throw new Error("Decipher function not found");

    this.ctx = {};
    vm.createContext(this.ctx);
    vm.runInContext(jsCode, this.ctx);
    this.ready = true;
  }

  async decipher(sig) {
    if (!this.ready) throw new Error("No JS source loaded");
    const fn = this.ctx[this.fnName];
    if (typeof fn !== "function") throw new Error("Decipher function not found in context");
    return fn(sig);
  }
}

module.exports = { JsDecipher };