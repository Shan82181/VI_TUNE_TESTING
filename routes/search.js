const express = require('express');
const router = express.Router();
const { searchMusic } = require('../services/innertubeService');

router.get('/', async (req,res)=> {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const data = await searchMusic(q);
    // attempt lightweight parse if possible
    const results = [];
    const contents = data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents
      || data?.contents?.sectionListRenderer?.contents || data?.continuationContents?.sectionListContinuation?.contents || [];
    for (const section of contents) {
      const items = section?.musicShelfRenderer?.contents || section?.musicCardShelfRenderer?.contents || [];
      for (const item of items) {
        const renderer = item?.musicResponsiveListItemRenderer || item?.musicTwoRowItemRenderer || item?.musicVideoRenderer || item?.videoRenderer || item;
        let videoId = renderer?.navigationEndpoint?.watchEndpoint?.videoId || renderer?.playNavigationEndpoint?.videoId || renderer?.videoId
        || renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
        if (!videoId && renderer?.flexColumns) {
          for (const col of renderer.flexColumns) {
            const runs = col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
            for (const run of runs) {
              if (run?.navigationEndpoint?.watchEndpoint?.videoId) { videoId = run.navigationEndpoint.watchEndpoint.videoId; break; }
            }
            if (videoId) break;
          }
        }
        if (!videoId) continue;
        const title = (renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || renderer?.title?.runs || []).map(r=>r.text).join('') || renderer?.title?.simpleText || '';
        const artist = (renderer?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || renderer?.subtitle?.runs || []).map(r=>r.text).join('') || renderer?.shortBylineText?.runs?.map(r=>r.text).join('') || '';
        const thumbnail = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url || renderer?.thumbnail?.thumbnails?.[0]?.url || '';
        results.push({ videoId, title, artist, thumbnail });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err && err.message });
  }
});
module.exports = router;
