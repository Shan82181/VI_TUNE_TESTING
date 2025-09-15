const axios = require('axios');
const { JsDecipher } = require('./jsDecipher');

const API_KEY = process.env.API_KEY;
const BASE_URL = 'https://youtubei.googleapis.com/youtubei/v1';

const decipher = new JsDecipher(); // kept as fallback but not used for ANDROID

function getContext(clientName = 'WEB_REMIX') {
  const clients = {
    ANDROID: { clientName: 'ANDROID', clientVersion: '19.50.37', platform: 'MOBILE' },
    WEB_REMIX: { clientName: 'WEB_REMIX', clientVersion: '1.20241211.07.00', platform: 'DESKTOP' },
    TV_EMBEDDED: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', platform: 'TV' },
    IOS: { clientName: 'IOS', clientVersion: '19.50.7', platform: 'MOBILE' },
    WEB: { clientName: 'WEB', clientVersion: '2.20241211.07.00', platform: 'DESKTOP' }
  };
  return { client: { ...(clients[clientName] || clients['WEB_REMIX']), hl: 'en', gl: 'US' } };
}

async function searchTracks(query) {
  const res = await axios.post(
    `${BASE_URL}/search?key=${API_KEY}`,
    { context: getContext('WEB_REMIX'), query, params: 'EgWKAQIIAWoKEAoQAxAEEAMQBA%3D%3D' },
    { headers: { 'Content-Type': 'application/json' } }
  );
  const contents = res.data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  const results = [];
  for (const section of contents) {
    const items = section?.musicShelfRenderer?.contents || [];
    for (const item of items) {
      const renderer = item.musicResponsiveListItemRenderer;
      if (!renderer) continue;
      const title = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
      const artist = renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
      const videoId = renderer?.playlistItemData?.videoId || renderer?.navigationEndpoint?.watchEndpoint?.videoId;
      if (videoId && title && artist) {
        results.push({ videoId, title, artist, thumbnail: renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url });
      }
    }
  }
  return results;
}

async function getTrackMetadata(videoId) {
  const res = await axios.post(
    `${BASE_URL}/player?key=${API_KEY}`,
    { context: getContext('WEB_REMIX'), videoId },
    { headers: { 'Content-Type': 'application/json' } }
  );
  const details = res.data?.videoDetails;
  if (!details) return null;
  return { title: details.title, artist: details.author, duration: parseInt(details.lengthSeconds) || 0, thumbnails: details.thumbnail?.thumbnails || [], description: details.shortDescription || '' };
}

// Use ANDROID client for playback to avoid signatureCipher
async function getStreamingUrls(videoId, clientType = 'ANDROID') {
  const res = await axios.post(
    `${BASE_URL}/player?key=${API_KEY}`,
    { context: getContext(clientType), videoId },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const data = res.data;
  const streamingData = data?.streamingData;
  if (!streamingData) throw new Error('No streaming data available');

  const urls = [];
  for (const fmt of streamingData.adaptiveFormats || []) {
    if (fmt.mimeType && fmt.mimeType.includes('audio')) {
      if (fmt.url) {
        urls.push({ url: fmt.url, mimeType: fmt.mimeType });
      } else if (fmt.signatureCipher || fmt.cipher) {
        // fallback: attempt decipher only if necessary
        const raw = fmt.signatureCipher || fmt.cipher;
        const params = new URLSearchParams(raw);
        const url = params.get('url');
        const s = params.get('s');
        const sp = params.get('sp') || 'sig';
        if (s) {
          if (!decipher.ready) {
            // try to fetch player JS from watch page
            const watch = await axios.get(`https://www.youtube.com/watch?v=${videoId}`);
            const m1 = watch.data.match(/"jsUrl":"([^"]+)"/);
            const m2 = watch.data.match(/\/s\/player\/[A-Za-z0-9_\-]+\/base\.js/);
            let jsUrl = m1 ? m1[1] : (m2 ? ('https://www.youtube.com' + m2[0]) : null);
            if (jsUrl) {
              const jsResp = await axios.get(jsUrl);
              decipher.prepareFromSource(jsResp.data);
            }
          }
          if (decipher.ready) {
            const sig = await decipher.decipher(s);
            urls.push({ url: `${url}&${sp}=${encodeURIComponent(sig)}`, mimeType: fmt.mimeType });
          }
        }
      }
    }
  }
  return urls;
}

module.exports = { searchTracks, getTrackMetadata, getStreamingUrls };
