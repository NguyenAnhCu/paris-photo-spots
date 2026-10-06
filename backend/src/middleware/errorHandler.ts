import type { ErrorRequestHandler, RequestHandler } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { AppError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND', 404, 'Route not found'))
}

// Errors thrown by framework middleware (body parser, multer) are client errors, not 500s.
function fromFrameworkError(err: unknown): AppError | null {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return new AppError('FILE_TOO_LARGE', 400, 'Image file is too large')
    return new AppError('UPLOAD_ERROR', 400, err.message)
  }
  const type = (err as { type?: unknown } | null)?.type
  if (type === 'entity.parse.failed') return new AppError('INVALID_JSON', 400, 'Malformed JSON body')
  if (type === 'entity.too.large') return new AppError('PAYLOAD_TOO_LARGE', 413, 'Request body too large')
  return null
}

export const errorHandler: ErrorRequestHandler = (rawErr, _req, res, _next) => {
  const err: unknown = fromFrameworkError(rawErr) ?? rawErr
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        status: 400,
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    })
    return
  }
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, status: err.status, details: err.details } })
    return
  }
  logger.error({ err }, 'Unhandled error')
  res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error', status: 500, details: [] } })
}
