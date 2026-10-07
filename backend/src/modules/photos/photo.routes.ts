import { Router } from 'express'
import multer from 'multer'
import { env } from '../../config/env.js'
import { AppError } from '../../lib/errors.js'
import { writeRateLimit } from '../../middleware/rateLimit.js'
import { currentUser, loadUser, requirePermission } from '../auth/session.js'
import { ACCEPTED_IMAGE_TYPES, ListPhotosBody, UploadPhotoFields } from './photo.schemas.js'
import { photoService } from './photo.service.js'

export const photoRouter = Router()

// Memory storage: the file is re-encoded by sharp before anything touches the disk (storage/photoStorage.ts).
// The MIME check is only a first filter; sharp decoding is the real proof that the bytes are an image.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if ((ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) cb(null, true)
    else cb(new AppError('UNSUPPORTED_IMAGE', 400, `Unsupported image type ${file.mimetype}`))
  },
})

// Rate limit and the session check run before multer so rejected clients don't get to upload megabytes first.
photoRouter.post('/', writeRateLimit, requirePermission('post'), upload.single('file'), async (req, res) => {
  const fields = UploadPhotoFields.parse(req.body)
  res.status(201).json(await photoService.upload(currentUser(req), fields, req.file?.buffer))
})

// Uploaders (and reviewers) also see photos still waiting for review.
photoRouter.post('/list', loadUser, async (req, res) => {
  res.json(await photoService.list(ListPhotosBody.parse(req.body), req.user))
})
