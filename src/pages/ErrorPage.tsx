import { Link, useRouteError } from 'react-router-dom'

export function ErrorPage({ notFound }: { notFound?: boolean }) {
  const err = useRouteError() as Error | undefined
  return (
    <div className="empty">
      <h1>{notFound ? 'Nothing here' : 'Something went wrong'}</h1>
      {!notFound && err?.message && <p className="muted">{err.message}</p>}
      <Link className="btn btn--primary" to="/">
        Back home
      </Link>
    </div>
  )
}
