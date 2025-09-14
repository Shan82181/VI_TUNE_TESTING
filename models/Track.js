const mongoose = require("mongoose");

const TrackSchema = new mongoose.Schema({
  videoId: { type: String, required: true, unique: true },
  title: String,
  artist: String,
  duration: Number,
  thumbnail: String,
  cachedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Track", TrackSchema);