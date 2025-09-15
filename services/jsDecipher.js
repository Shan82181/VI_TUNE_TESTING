// Lightweight jsDecipher kept as fallback (will rarely be used because we use ANDROID for streaming)
const vm = require('vm');
const fs = require('fs');
const path = require('path');

class JsDecipher {
  constructor() {
    this.ready = false;
    this.fnName = null;
    this.source = null;
    this.cachePath = path.join(__dirname, '..', 'tmp', 'player_js_cache.js');
    try { fs.mkdirSync(path.dirname(this.cachePath), { recursive: true }); } catch (e) {}
  }

  prepareFromSource(jsCode) {
    this.source = jsCode;
    // basic attempt to find function name (may need improvement)
    const m = jsCode.match(/\b([A-Za-z0-9_$]{2,})=function\(a\)\{a=a\.split\(""\)/);
    if (!m) throw new Error('Decipher function not found');
    this.fnName = m[1];
    // extract function body
    const bodyMatch = new RegExp(this.fnName + '\\s*=\\s*function\\(a\\)\\{([\\s\\S]*?)\\}').exec(jsCode);
    if (!bodyMatch) throw new Error('Function body not found');
    const fnBody = bodyMatch[1];
    const execSrc = 'function __dec(a){' + fnBody + '}\n;';
    this.ctx = {};
    vm.createContext(this.ctx);
    vm.runInContext(execSrc, this.ctx);
    this.ctx.__call = (s) => this.ctx.__dec(s);
    this.ready = true;
  }

  loadCacheIfExists() {
    if (this.ready) return;
    try {
      if (fs.existsSync(this.cachePath)) {
        const src = fs.readFileSync(this.cachePath, 'utf8');
        this.prepareFromSource(src);
      }
    } catch (e) {}
  }

  async decipher(sig) {
    if (!this.ready) this.loadCacheIfExists();
    if (!this.ready) throw new Error('Decipher not prepared');
    try {
      return String(this.ctx.__call(String(sig)));
    } catch (e) {
      throw new Error('Decipher execution failed: ' + (e && e.message || e));
    }
  }
}

module.exports = { JsDecipher };
