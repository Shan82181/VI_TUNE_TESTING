const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vitune';
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Mongo connected');
  } catch (err) {
    console.error('Mongo connect error', err && err.message);
    process.exit(1);
  }
};
module.exports = connectDB;
