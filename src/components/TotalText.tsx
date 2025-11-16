import React from 'react'

type TotalVariant = 'inflow' | 'outflow' | 'neutral'

export interface TotalTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: TotalVariant
}

const colorMap: Record<TotalVariant, string> = {
  inflow: 'text-success',
  outflow: 'text-danger',
  neutral: 'text-text-primary',
}

const TotalText: React.FC<TotalTextProps> = ({ variant, className = '', children, ...rest }) => {
  const classes = `${colorMap[variant]} text-sm md:text-lg font-normal ${className}`.trim()

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  )
}

export default TotalText


