// services/jsDecipher.js
// Improved debug + broader regexes to find YouTube decipher function
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
    console.log('🔍 Preparing decipher from player JS (improved regexes)...');
    this.source = jsCode;

    // A wide set of regex candidates. We try many patterns used historically.
    const regexCandidates = [
      // classic split/join
      /\b([A-Za-z0-9_$]{2,})\s*=\s*function\s*\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(["']{0,1}["']{0,1}\)/m,
      /\bfunction\s+([A-Za-z0-9_$]{2,})\s*\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(["']{0,1}["']{0,1}\)/m,
      // return a.join("") style (some builds use join without explicit split in same function)
      /\b([A-Za-z0-9_$]{2,})\s*=\s*function\s*\(\s*a\s*\)\s*\{[\s\S]{0,200}?return\s+a\.join\(/m,
      /\bfunction\s+([A-Za-z0-9_$]{2,})\s*\(\s*a\s*\)\s*\{[\s\S]{0,200}?return\s+a\.join\(/m,
      // functions that call helper object methods: var a=function(a){a=a.split("");...;return a.join("")}
      /\b([A-Za-z0-9_$]{2,})\s*=\s*function\s*\(\s*a\s*\)\s*\{[\s\S]{0,200}?\;?([A-Za-z0-9_$]{2,})\.\w+\(/m,
      // patterns using reverse/splice/slice (common transforms)
      /\b([A-Za-z0-9_$]{2,})\s*=\s*function\s*\(\s*a\s*\)\s*\{[\s\S]{0,200}?(?:reverse|splice|slice)\(/m,
      // assignment style: a=function(b){b=b.split("");...}
      /([A-Za-z0-9_$]{2,})\s*=\s*function\(\w\)\s*\{\s*\w\s*=\s*\w\.split\(["']{0,1}["']{0,1}\)/m,
      // other patterns: e.g. "c&& (c=pa(decodeURIComponent(c)))" style from Kotlin regexes
      /\bc&&\([^)]+=([A-Za-z0-9_$]{2,})\(/m,
      /\bm=([A-Za-z0-9_$]{2,})\(decodeURIComponent\(h\.s\)\)/m
    ];

    let foundName = null;
    for (const r of regexCandidates) {
      const m = r.exec(jsCode);
      if (m && m[1]) {
        foundName = m[1];
        console.log('✅ Regex matched candidate function name:', foundName, 'pattern:', r.toString());
        break;
      }
    }

    if (!foundName) {
      console.error('❌ No decipher function matched with improved regex set.');
      // Provide helpful debug outputs: show top and nearby areas of the JS
      const snippetLen = 1200;
      console.log('👉 Dumping first', snippetLen, 'chars of player JS for inspection:\n');
      console.log(jsCode.slice(0, snippetLen));
      // Also attempt to show area around typical "player" tokens
      const idx = jsCode.indexOf('signature') !== -1 ? jsCode.indexOf('signature') : jsCode.indexOf('decipher');
      if (idx !== -1) {
        console.log('\n👉 Snippet around token (signature/decipher):');
        console.log(jsCode.slice(Math.max(0, idx - 300), idx + 300));
      }
      // write cache to file for easier inspection if needed
      try { fs.writeFileSync(this.cachePath + '.debug.js', jsCode.slice(0, snippetLen), 'utf8'); } catch (e) {}
      return;
    }

    this.fnName = foundName;

    // Try to extract function body with multiple extraction strategies
    let fnBody = null;
    const bodyPatterns = [
      // fn=function(a){...}
      new RegExp(this.fnName + '\\s*=\\s*function\\s*\\(\\s*a\\s*\\)\\s*\\{([\\s\\S]*?)\\}'),
      // function fn(a){...}
      new RegExp('function\\s+' + this.fnName + '\\s*\\(\\s*a\\s*\\)\\s*\\{([\\s\\S]*?)\\}'),
      // fn:function(a){...} (object property)
      new RegExp(this.fnName + '\\s*:\\s*function\\s*\\(\\s*a\\s*\\)\\s*\\{([\\s\\S]*?)\\}')
    ];

    for (const p of bodyPatterns) {
      const mm = p.exec(jsCode);
      if (mm && mm[1]) {
        fnBody = mm[1];
        console.log('✅ Extracted function body with pattern:', p.toString());
        break;
      }
    }

    if (!fnBody) {
      console.error('❌ Could not extract function body for', this.fnName);
      // dump nearby region around fn name
      const pos = jsCode.indexOf(this.fnName);
      if (pos !== -1) {
        console.log('👉 Snippet near function name:');
        console.log(jsCode.slice(Math.max(0, pos - 300), pos + 300));
      }
      // For safety write debug to disk
      try { fs.writeFileSync(this.cachePath + '.fn-missing.debug.js', jsCode.slice(0, 2000), 'utf8'); } catch (e) {}
      return;
    }

    // Try to find helper object referenced by the function body (like "var Ab={...}")
    let helperObjName = null;
    const helperMatch = /;([A-Za-z0-9_$]{2,})\.\w+\(/.exec(fnBody);
    if (helperMatch) {
      helperObjName = helperMatch[1];
      console.log('ℹ️  Helper object candidate found in body:', helperObjName);
    } else {
      // Try different pattern: objName["m"](a,2)
      const m2 = /([A-Za-z0-9_$]{2,})\[[\"']\w+[\"']\]\(/.exec(fnBody);
      if (m2) {
        helperObjName = m2[1];
        console.log('ℹ️  Helper object candidate (bracket) found:', helperObjName);
      }
    }

    let helperObjBody = null;
    if (helperObjName) {
      const objRegex = new RegExp('var\\s+' + helperObjName + '\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;');
      const objM = objRegex.exec(jsCode);
      if (objM) {
        helperObjBody = 'var ' + helperObjName + ' = {' + objM[1] + '};';
        console.log('✅ Extracted helper object body.');
      } else {
        console.warn('⚠️ Could not extract full helper object body for', helperObjName);
      }
    }

    // Build safe source for VM. Replace dangerous globals.
    let safeSrc = jsCode
      .replace('document.location.hostname', '"youtube.com"')
      .replace('window.location.hostname', '"youtube.com"')
      .replace('XMLHttpRequest.prototype.fetch', 'function(){}');

    // For safety, only keep the helper object and function definition to run
    let execSrc = '';
    if (helperObjBody) execSrc += helperObjBody + '\n';
    // assemble a small wrapper function definition
    execSrc += 'function __yt_decfn(a) {' + fnBody + '}\n;';

    // Write to cache (useful to debug later)
    try { fs.writeFileSync(this.cachePath, execSrc, 'utf8'); } catch (e) {}

    // Create VM context and run
    try {
      this.ctx = {};
      vm.createContext(this.ctx);
      vm.runInContext(execSrc, this.ctx, { timeout: 2000 });
      if (typeof this.ctx.__yt_decfn !== 'function') {
        console.error('❌ __yt_decfn not a function after VM run');
        return;
      }
      // attach a small caller to call by name
      this.ctx.__call = (s) => this.ctx.__yt_decfn(s);
      this.ready = true;
      console.log('✅ Decipher prepared and VM-ready.');
    } catch (e) {
      console.error('❌ Error while running function in VM:', e && e.message || e);
      try { fs.writeFileSync(this.cachePath + '.vm.error.js', execSrc, 'utf8'); } catch (ee) {}
    }
  }

  loadCacheIfExists() {
    if (this.ready) return;
    try {
      if (fs.existsSync(this.cachePath)) {
        const src = fs.readFileSync(this.cachePath, 'utf8');
        // src here is the small execSrc we previously wrote
        this.prepareFromSource(src);
      }
    } catch (e) {
      // ignore
    }
  }

  async decipher(sig) {
    if (!this.ready) this.loadCacheIfExists();
    if (!this.ready) throw new Error('Decipher not prepared');
    try {
      // call the attached caller
      const out = this.ctx.__call(String(sig));
      return String(out);
    } catch (e) {
      throw new Error('Decipher execution failed: ' + (e && e.message || e));
    }
  }
}

module.exports = { JsDecipher };
