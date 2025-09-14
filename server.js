require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const apiRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use("/api", apiRoutes);

// serve minimal frontend
app.use(express.static(path.join(__dirname, "public")));

if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("Mongo error:", err));
}

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});