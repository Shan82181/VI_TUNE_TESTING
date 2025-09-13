const mongoose = require('mongoose');
const trackSchema = new mongoose.Schema({
  videoId: { type: String, unique: true },
  title: String,
  artist: String,
  album: String,
  duration: Number,
  thumbnail: String,
  description: String,
  fetchedAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Track', trackSchema);
