import { Fragment } from 'react'

type InterludeProperties = {
  id?: string
  kicker: string
  title: readonly string[]
  copy: string
}

export const Interlude = ({ id, kicker, title, copy }: InterludeProperties) => (
  <div className="interlude reveal" id={id}>
    <p className="kicker">{kicker}</p>
    <h2>
      {title.map((line, index) => (
        <Fragment key={line}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </h2>
    <p className="interlude-copy">{copy}</p>
  </div>
)
