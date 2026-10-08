import { Router } from 'express'
import { currentUser, requirePermission } from '../auth/session.js'
import { AdminSuspendBody, DeleteUserBody, ListUsersBody, ModerationLogBody, SetRoleBody } from './admin.schemas.js'
import { adminService } from './admin.service.js'

// Admins only (manage_users / system). Never cached.
export const adminRouter = Router()
adminRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

adminRouter.post('/users/list', requirePermission('manage_users'), async (req, res) => {
  res.json(await adminService.listUsers(ListUsersBody.parse(req.body)))
})
adminRouter.post('/users/set-role', requirePermission('manage_users'), async (req, res) => {
  res.json(await adminService.setRole(currentUser(req), SetRoleBody.parse(req.body)))
})
adminRouter.post('/users/suspend', requirePermission('manage_users'), async (req, res) => {
  res.json(await adminService.suspend(currentUser(req), AdminSuspendBody.parse(req.body)))
})
adminRouter.post('/users/delete', requirePermission('manage_users'), async (req, res) => {
  res.json(await adminService.deleteUser(currentUser(req), DeleteUserBody.parse(req.body)))
})
adminRouter.post('/moderation-log/list', requirePermission('manage_users'), async (req, res) => {
  res.json(await adminService.moderationLog(ModerationLogBody.parse(req.body)))
})
adminRouter.get('/config', requirePermission('system'), (_req, res) => {
  res.json(adminService.config())
})
