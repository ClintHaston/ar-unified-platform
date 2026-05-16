import { useState } from 'react'

interface Props {
  src: string
  title: string
}

export function ToolFrame({ src, title }: Props) {
  const [stableSrc] = useState(src)

  return (
    <div className="page-frame">
      <iframe src={stableSrc} title={title} allow="fullscreen" />
    </div>
  )
}
