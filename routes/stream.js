const express = require('express');
const router = express.Router();
const { fetchPlayerResponse, parseStreamingUrls } = require('../services/innertubeService');

router.get('/:videoId', async (req,res)=> {
  const videoId = req.params.videoId;
  if (!videoId) return res.status(400).json({ error: 'videoId required' });
  try {
    const playerResp = await fetchPlayerResponse(videoId);
    const streams = await parseStreamingUrls(playerResp, videoId);
    if (!streams || streams.length===0) return res.status(404).json({ error: 'no_streams' });
    res.json({ videoId, streams });
  } catch (err) {
    console.error('stream error', err && err.message);
    res.status(500).json({ error: err && err.message });
  }
});
module.exports = router;
