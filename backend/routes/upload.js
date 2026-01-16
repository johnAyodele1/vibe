const express = require("express");
const multer = require("multer");
const { authenticateToken } = require("../middleware/auth");
const {
  uploadPhoto,
  deletePhoto,
  setMainPhoto,
} = require("../controllers/uploadController");

const router = express.Router();

// Configure multer for memory storage (for Cloudinary)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880, // 5MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

// @route   POST /api/upload/photo
// @desc    Upload user photo to Cloudinary
// @access  Private
router.post("/photo", authenticateToken, upload.single("photo"), uploadPhoto);

// @route   DELETE /api/upload/photo/:publicId
// @desc    Delete user photo from Cloudinary
// @access  Private
router.delete("/photo/:publicId", authenticateToken, deletePhoto);

// @route   PUT /api/upload/set-main/:index
// @desc    Set a photo as main profile picture
// @access  Private
router.put("/set-main/:index", authenticateToken, setMainPhoto);

module.exports = router;
