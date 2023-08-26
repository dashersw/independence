export async function api(path, options) {
  const res = await fetch(`/api${path}`, options)
  const body = await res.json()
  if (!body.ok) throw new Error(body.error)
  return body.data
}

export const post = (path, data) =>
  api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) })

export const put = (path, data) =>
  api(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) })

/** Fire a toast from anywhere; <Toasts/> listens. */
export const toast = (message, isError = false) =>
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, isError } }))
