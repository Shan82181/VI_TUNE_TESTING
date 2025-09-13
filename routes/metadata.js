const express = require('express');
const router = express.Router();
const Track = require('../models/Track');
const { fetchPlayerResponse } = require('../services/innertubeService');

router.get('/:videoId', async (req,res)=> {
  const videoId = req.params.videoId;
  if (!videoId) return res.status(400).json({ error: 'videoId required' });
  try {
    let track = await Track.findOne({ videoId }).lean();
    if (track) return res.json({ cached: true, metadata: track });
    const resp = await fetchPlayerResponse(videoId);
    const vd = resp?.videoDetails;
    if (!vd) return res.status(404).json({ error: 'not_found' });
    const md = {
      videoId,
      title: vd.title || '',
      artist: vd.author || '',
      album: resp?.microformat?.playerMicroformatRenderer?.publishDate || undefined,
      duration: parseInt(vd.lengthSeconds || '0'),
      thumbnail: vd.thumbnail?.thumbnails?.[0]?.url || '',
      description: vd.shortDescription || ''
    };
    await Track.updateOne({ videoId }, { $set: md }, { upsert: true });
    res.json({ cached: false, metadata: md });
  } catch (err) {
    console.error('metadata error', err && err.message);
    res.status(500).json({ error: err && err.message });
  }
});
module.exports = router;
