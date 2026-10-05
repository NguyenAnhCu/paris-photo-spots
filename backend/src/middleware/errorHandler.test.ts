import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AppError } from '../lib/errors.js'
import { errorHandler, notFoundHandler } from './errorHandler.js'

function respond(err: unknown) {
  const res = { status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  errorHandler(err, {} as Request, res as unknown as Response, vi.fn() as NextFunction)
  return {
    status: res.status.mock.calls[0]?.[0] as number,
    body: res.json.mock.calls[0]?.[0] as { error: Record<string, unknown> },
  }
}

describe('errorHandler', () => {
  it('returns AppError code, status and details as is', () => {
    const { status, body } = respond(new AppError('SPOT_DUPLICATE', 409, 'A spot already exists here', [{ id: 'x' }]))
    expect(status).toBe(409)
    expect(body.error).toEqual({
      code: 'SPOT_DUPLICATE',
      message: 'A spot already exists here',
      status: 409,
      details: [{ id: 'x' }],
    })
  })

  it('turns Zod errors into 400 VALIDATION_ERROR with one detail per field', () => {
    const result = z.object({ name: z.string(), lat: z.number() }).safeParse({ lat: 'north' })
    const { status, body } = respond(result.error)
    expect(status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'name' }), expect.objectContaining({ field: 'lat' })]),
    )
  })

  it('maps a too-large upload to 400 FILE_TOO_LARGE, other multer errors to UPLOAD_ERROR', () => {
    expect(respond(new multer.MulterError('LIMIT_FILE_SIZE'))).toMatchObject({
      status: 400,
      body: { error: { code: 'FILE_TOO_LARGE' } },
    })
    expect(respond(new multer.MulterError('LIMIT_FILE_COUNT'))).toMatchObject({
      status: 400,
      body: { error: { code: 'UPLOAD_ERROR' } },
    })
  })

  it('maps body-parser errors: malformed JSON → 400, oversized body → 413', () => {
    expect(respond(Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed' }))).toMatchObject({
      status: 400,
      body: { error: { code: 'INVALID_JSON' } },
    })
    expect(respond(Object.assign(new Error('too large'), { type: 'entity.too.large' }))).toMatchObject({
      status: 413,
      body: { error: { code: 'PAYLOAD_TOO_LARGE' } },
    })
  })

  it('hides unexpected errors behind a generic 500', () => {
    const { status, body } = respond(new Error('password=hunter2 leaked in a driver message'))
    expect(status).toBe(500)
    expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error', status: 500, details: [] })
  })
})

describe('notFoundHandler', () => {
  it('forwards a 404 NOT_FOUND AppError', () => {
    const next = vi.fn()
    notFoundHandler({} as Request, {} as Response, next)
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })
})
