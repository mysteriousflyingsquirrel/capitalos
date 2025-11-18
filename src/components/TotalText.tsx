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
  // Use inline styles to ensure colors are applied (overrides any CSS)
  const colorStyle = variant === 'inflow' 
    ? { color: '#2ECC71' } 
    : variant === 'outflow' 
    ? { color: '#E74C3C' } 
    : {}
  
  // Use text1 for font size (as defined in tailwind.config.js fontSize.text1)
  const classes = `text-text1 font-normal ${className}`.trim()

  return (
    <span className={classes} style={colorStyle} {...rest}>
      {children}
    </span>
  )
}

export default TotalText


