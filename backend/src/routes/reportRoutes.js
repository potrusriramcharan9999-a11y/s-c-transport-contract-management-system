const express = require("express");
const reportController = require("../controllers/reportController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.get("/revenue-trend", reportController.revenueTrend);
router.get("/contract-status", reportController.contractStatus);
router.get("/export", requireRole("ADMIN", "STAFF"), reportController.exportReport);

module.exports = router;
