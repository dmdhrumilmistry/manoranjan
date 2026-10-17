import { lazy, Suspense } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { ErrorPage } from './pages/ErrorPage'

// Route-level code splitting keeps the first load small.
const Browse = lazy(() => import('./pages/Browse'))
const Title = lazy(() => import('./pages/Title'))
const Watch = lazy(() => import('./pages/Watch'))
const Music = lazy(() => import('./pages/Music'))
const Search = lazy(() => import('./pages/Search'))
const Local = lazy(() => import('./pages/Local'))
const Party = lazy(() => import('./pages/Party'))
const Settings = lazy(() => import('./pages/Settings'))
const About = lazy(() => import('./pages/About'))

const page = (el: React.ReactNode) => <Suspense fallback={<div className="page-loading" aria-busy />}>{el}</Suspense>

// Hash routing: GitHub Pages has no SPA rewrites, and hash URLs work under any repo path.
const router = createHashRouter([
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/movies', element: page(<Browse kind="movie" />) },
      { path: '/series', element: page(<Browse kind="series" />) },
      { path: '/title/:id', element: page(<Title />) },
      { path: '/watch/:id', element: page(<Watch />) },
      { path: '/music', element: page(<Music />) },
      { path: '/search', element: page(<Search />) },
      { path: '/local', element: page(<Local />) },
      { path: '/party/:roomId', element: page(<Party />) },
      { path: '/settings', element: page(<Settings />) },
      { path: '/about', element: page(<About />) },
      { path: '*', element: <ErrorPage notFound /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
