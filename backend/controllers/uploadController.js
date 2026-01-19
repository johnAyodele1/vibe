const cloudinary = require("cloudinary").v2;
const User = require("../models/User");

// Configure Cloudinary
cloudinary.config({
  cloudinary_url: process.env.CLOUDINARY_URL,
});

// @desc    Upload user photo to Cloudinary
// @access  Private
const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "vibe-photos",
          public_id: `${req.user._id}_${Date.now()}`,
          transformation: [
            { width: 500, height: 500, crop: "limit" },
            { quality: "auto" },
          ],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    // Add photo to user's photos array
    const user = await User.findById(req.user._id);
    const photoData = {
      url: result.secure_url,
      isMain: user.photos.length === 0, // First photo is main by default
      order: user.photos.length,
    };

    user.photos.push(photoData);
    await user.save();

    res.json({
      success: true,
      message: "Photo uploaded successfully",
      data: {
        photo: photoData,
        public_id: result.public_id,
      },
    });
  } catch (error) {
    console.error("Photo upload error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during upload",
    });
  }
};

// @desc    Delete user photo from Cloudinary
// @access  Private
const deletePhoto = async (req, res) => {
  try {
    const publicId = req.params.publicId;

    // Find and remove photo from user's photos array
    const user = await User.findById(req.user._id);
    const photoIndex = user.photos.findIndex((photo) =>
      photo.url.includes(publicId)
    );

    if (photoIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Photo not found",
      });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    // Remove from user's photos array
    user.photos.splice(photoIndex, 1);
    await user.save();

    res.json({
      success: true,
      message: "Photo deleted successfully",
    });
  } catch (error) {
    console.error("Photo delete error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during deletion",
    });
  }
};

// @desc    Set a photo as main profile picture
// @access  Private
const setMainPhoto = async (req, res) => {
  try {
    const photoIndex = parseInt(req.params.index);

    const user = await User.findById(req.user._id);

    if (photoIndex < 0 || photoIndex >= user.photos.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid photo index",
      });
    }

    // Set all photos as not main
    user.photos.forEach((photo) => {
      photo.isMain = false;
    });

    // Set selected photo as main
    user.photos[photoIndex].isMain = true;
    await user.save();

    res.json({
      success: true,
      message: "Main photo updated successfully",
    });
  } catch (error) {
    console.error("Set main photo error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  uploadPhoto,
  deletePhoto,
  setMainPhoto,
};
