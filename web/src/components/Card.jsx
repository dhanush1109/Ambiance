/**
 * Solid content surface.
 *
 * Deliberately NOT glass: Apple's Liquid Glass guidance reserves the material
 * for the navigation layer. Content cards earn their depth from a hairline
 * border and a lit-from-above inner highlight instead.
 */
export default function Card({
  as: Tag = 'div',
  raise = false,
  interactive = false,
  active = false,
  className = '',
  children,
  ...rest
}) {
  const cls = [
    raise ? 'card-raise' : 'card',
    interactive ? 'card-interactive' : '',
    active ? 'card-active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  )
}
