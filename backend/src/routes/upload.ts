import { Router } from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth';
import {
  uploadPhoto,
  deletePhoto,
  setMainPhoto,
} from '../controllers/upload.controller';

const router = Router();

// Configure multer for memory storage (for Cloudinary)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880'), // 5MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  },
});

router.post('/photo', authenticateToken, upload.single('photo'), uploadPhoto);
router.delete('/photo/:publicId', authenticateToken, deletePhoto);
router.put('/set-main/:index', authenticateToken, setMainPhoto);

export default router;
