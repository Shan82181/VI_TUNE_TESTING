const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = require("./config/db");
const searchRoutes = require("./routes/search");
const metadataRoutes = require("./routes/metadata");
const streamRoutes = require("./routes/stream");

const PORT = process.env.PORT || 3000;

// DB connection
connectDB();

const app = express();
app.use(express.json());

// Routes
app.use("/api/search", searchRoutes);
app.use("/api/metadata", metadataRoutes);
app.use("/api/stream", streamRoutes);

app.get("/", (req, res) => res.send("Vitune backend running 🚀"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
