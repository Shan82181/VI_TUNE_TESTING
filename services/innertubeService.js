const axios = require('axios');
const decipher = require('./jsDecipher'); // note: file name
const makeContext = require('../utils/context');

const API_KEY = process.env.API_KEY;

async function fetchPlayerResponse(videoId, clientName='WEB_REMIX') {
  const url = `https://youtubei.googleapis.com/youtubei/v1/player?key=${API_KEY}`;
  const payload = { context: makeContext(clientName), videoId };

  try {
    const res = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY,
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 8000
    });
    return res.data;
  } catch (err) {
    console.warn('player request failed:', err && err.message);
    throw err;
  }
}

async function fetchPlayerJsFromAssets(playerResponse, videoId) {
  // try assets.js first
  const jsUrl = playerResponse?.assets?.js;
  if (jsUrl) {
    const full = jsUrl.startsWith('http') ? jsUrl : `https://www.youtube.com${jsUrl}`;
    try {
      const res = await axios.get(full, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
      return { source: res.data, url: full };
    } catch (e) {
      console.warn('failed to fetch assets.js:', e && e.message);
    }
  }

  // fallback: fetch watch page and extract base.js
  try {
    const watchHtml = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
    const m = /"(\/s\/player\/[^\"]+base\.js)"/.exec(watchHtml.data) || /"(https?:\/\/www\.youtube\.com\/s\/player\/[^"]+base\.js)"/.exec(watchHtml.data);
    if (m && m[1]) {
      const candidate = m[1].startsWith('http') ? m[1].replace(/\\\//g, '/') : `https://www.youtube.com${m[1]}`;
      const jsRes = await axios.get(candidate, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
      return { source: jsRes.data, url: candidate };
    }
  } catch (e) {
    console.warn('watch page fetch failed:', e && e.message);
  }

  return null;
}

async function parseStreamingUrls(playerResponse, videoId) {
  if (!playerResponse) return [];

  const streamingData = playerResponse.streamingData;
  if (!streamingData) return [];

  const all = [...(streamingData.adaptiveFormats || []), ...(streamingData.formats || [])];
  const results = [];

  for (const fmt of all) {
    let url = fmt.url;
    const cipher = fmt.signatureCipher || fmt.cipher;
    if (!url && cipher) {
      const params = new URLSearchParams(cipher);
      const cipherUrl = params.get('url');
      const s = params.get('s');
      const sp = params.get('sp') || 'signature';
      if (!cipherUrl) continue;

      if (s) {
        // ensure decipher prepared
        if (!decipher.prepared) {
          const js = await fetchPlayerJsFromAssets(playerResponse, videoId);
          if (!js) {
            throw new Error('No player JS available to decipher');
          }
          await decipher.prepare({ source: js.source, timestamp: null });
        }
        const actual = await decipher.decode(s);
        url = `${cipherUrl}&${sp}=${actual}`;
      } else {
        url = cipherUrl;
      }
    }

    if (!url) continue;
    results.push({ url, mimeType: fmt.mimeType || fmt.mime_type, bitrate: fmt.bitrate || 0, quality: fmt.audioQuality || fmt.qualityLabel || 'unknown' });
  }

  return results;
}

async function searchMusic(query, clientName='WEB_REMIX') {
  const url = `https://music.youtube.com/youtubei/v1/search?key=${API_KEY}`;
  const payload = { context: makeContext(clientName), query };

  const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY }, timeout: 8000 });
  return res.data;
}

module.exports = { fetchPlayerResponse, parseStreamingUrls, searchMusic };
