const express = require("express");
const axios = require("axios");
const { searchTracks, getTrackMetadata, getStreamingUrls } = require("../services/innertubeService");

const router = express.Router();

router.get("/search", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: "Missing query param ?q=" });
    const results = await searchTracks(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/metadata/:id", async (req, res) => {
  try {
    const data = await getTrackMetadata(req.params.id);
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stream/:id", async (req, res) => {
  try {
    const urls = await getStreamingUrls(req.params.id);
    res.json(urls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// proxy endpoint
// router.get("/proxy/:id", async (req, res) => {
//   try {
//     const urls = await getStreamingUrls(req.params.id);
//     const best = urls.find(u => u.mimeType.includes("audio"));
//     if (!best) return res.status(404).json({ error: "No stream" });

//     const response = await axios.get(best.url, { responseType: "stream" });
//     res.setHeader("Content-Type", best.mimeType);
//     response.data.pipe(res);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

router.get("/proxy/:id", async (req, res) => {
  try {
    const urls = await getStreamingUrls(req.params.id);

    // Pick best audio/mp4 (universal)
    const best = urls.find(u => u.mimeType.includes("audio/mp4")) 
             || urls.find(u => u.mimeType.includes("audio"));

    if (!best) {
      return res.status(404).json({ error: "No audio stream found" });
    }

    // Stream from YouTube
    const response = await axios.get(best.url, {
      responseType: "stream",
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        "Range": req.headers["range"] || "bytes=0-",
      }
    });

    res.setHeader("Content-Type", best.mimeType);
    if (response.headers["content-length"]) {
      res.setHeader("Content-Length", response.headers["content-length"]);
    }
    if (response.headers["accept-ranges"]) {
      res.setHeader("Accept-Ranges", response.headers["accept-ranges"]);
    }
    if (response.headers["content-range"]) {
      res.setHeader("Content-Range", response.headers["content-range"]);
    }

    response.data.pipe(res);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: "Proxy failed", detail: err.message });
  }
});



module.exports = router;