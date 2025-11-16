import React from 'react'

type HeadingLevel = 1 | 2 | 3 | 4

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level: HeadingLevel
}

const baseClasses: Record<HeadingLevel, string> = {
  1: 'text-xl md:text-2xl font-bold text-text-secondary',
  2: 'text-lg md:text-xl font-bold text-text-secondary',
  3: 'text-sm md:text-lg font-bold text-text-secondary',
  4: 'text-sm md:text-lg font-bold text-text-primary',
}

const Heading: React.FC<HeadingProps> = ({ level, children, className = '', ...rest }) => {
  const Tag = (level === 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4') as keyof JSX.IntrinsicElements
  const classes = `${baseClasses[level]} ${className}`.trim()

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  )
}

export default Heading


