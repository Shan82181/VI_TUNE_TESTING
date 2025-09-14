const express = require('express');
const axios = require('axios');
const { searchTracks, getTrackMetadata, getStreamingUrls } = require('../services/innertubeService');

const router = express.Router();

router.get('/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Missing query param ?q=' });
    const results = await searchTracks(q);
    res.json(results);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/metadata/:id', async (req, res) => {
  try {
    const data = await getTrackMetadata(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    console.error('Metadata error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/stream/:id', async (req, res) => {
  try {
    const client = req.query.client || 'ANDROID';
    const urls = await getStreamingUrls(req.params.id, client);
    res.json(urls);
  } catch (err) {
    console.error('Stream error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proxy route: streams audio through backend to avoid CDN Access Denied
router.get('/proxy/:id', async (req, res) => {
  try {
    const client = (req.query.client || 'WEB_REMIX').toUpperCase();
    // fetch fresh urls with same client context
    const urls = await getStreamingUrls(req.params.id, client);
    const best = urls.find(u => u.mimeType && u.mimeType.includes('audio/mp4')) 
              || urls.find(u => u.mimeType && u.mimeType.includes('audio')) 
              || urls[0];
    if (!best) return res.status(404).json({ error: 'No stream' });

    // choose headers matching client type
    const uaFromReq = req.headers['user-agent'] || 'Mozilla/5.0';
    function getProxyHeaders(clientType) {
      switch (clientType) {
        case 'ANDROID':
          return {
            'User-Agent': 'com.google.android.youtube/19.50.37 (Linux; U; Android 14) gzip',
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
            'x-origin': 'https://www.youtube.com',
            'Range': req.headers['range'] || 'bytes=0-',
          };
        case 'WEB_REMIX':
          return {
            'User-Agent': uaFromReq,
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Origin': 'https://music.youtube.com',
            'Referer': 'https://music.youtube.com/',
            'x-origin': 'https://music.youtube.com',
            'Range': req.headers['range'] || 'bytes=0-',
          };
        case 'WEB':
        default:
          return {
            'User-Agent': uaFromReq,
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
            'x-origin': 'https://www.youtube.com',
            'Range': req.headers['range'] || 'bytes=0-',
          };
      }
    }

    const headers = getProxyHeaders(client);

    // Request stream from Google CDN
    const response = await axios.get(best.url, {
      responseType: 'stream',
      headers,
      validateStatus: () => true
    });

    if (response.status >= 400) {
      console.error('CDN rejected', response.status, response.statusText);
      return res.status(response.status).json({ error: 'YouTube CDN refused the request', status: response.status });
    }

    // Forward important headers
    if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
    if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
    if (response.headers['content-range']) res.setHeader('Content-Range', response.headers['content-range']);
    res.setHeader('Content-Type', best.mimeType || 'audio/mpeg');

    response.data.pipe(res);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: 'Proxy failed', detail: err.message });
  }
});

module.exports = router;
