import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AccountProvider } from './components/account/AccountProvider'
import { DevPage } from './pages/DevPage'
import { MapLayout } from './pages/MapLayout'
import { AddPhotoRoute, AddSpotRoute, ListRoute, SpotRoute } from './pages/routes'
import { MyPostsPage } from './pages/MyPostsPage'
import { StaffSignInPage } from './pages/StaffSignInPage'
import { TermsPage } from './pages/TermsPage'

// Staff only: a separate chunk participants never download.
const ReviewPage = lazy(() => import('./pages/review/ReviewPage'))

// URL = screen (design views list / detail / photos / add); filters live in ?cat=&q= (see useSpotFilters).
export function App() {
  return (
    <AccountProvider>
      <Routes>
        <Route element={<MapLayout />}>
          <Route index element={<ListRoute />} />
          <Route path="spots/:id" element={<SpotRoute view="detail" />} />
          <Route path="spots/:id/photos" element={<SpotRoute view="photos" />} />
          <Route path="spots/:id/add-photo" element={<AddPhotoRoute />} />
          <Route path="add" element={<AddSpotRoute />} />
        </Route>
        <Route path="terms" element={<TermsPage />} />
        <Route path="me/posts" element={<MyPostsPage />} />
        <Route path="staff/sign-in" element={<StaffSignInPage />} />
        <Route
          path="review"
          element={
            <Suspense fallback={null}>
              <ReviewPage />
            </Suspense>
          }
        />
        {import.meta.env.DEV && <Route path="dev" element={<DevPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AccountProvider>
  )
}
