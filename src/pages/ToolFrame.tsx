interface Props {
  src: string
  title: string
}

export function ToolFrame({ src, title }: Props) {
  return (
    <div className="page-frame">
      <iframe src={src} title={title} allow="fullscreen" />
    </div>
  )
}
