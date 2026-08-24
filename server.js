require("dotenv").config();
const express = require("express");
const cookieSession = require("cookie-session");
const path = require("path");

const { startPolling } = require("./espn");
const publicRoutes = require("./routes/public");
const apiRoutes = require("./routes/api");
const adminRoutes = require("./routes/admin");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  cookieSession({
    name: "session",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    maxAge: 24 * 60 * 60 * 1000,
  })
);

app.use("/", publicRoutes);
app.use("/api", apiRoutes);
app.use("/admin", adminRoutes);

app.use((req, res) => res.status(404).render("404"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Fantasy Live running at http://localhost:${PORT}`);
  startPolling();
});
