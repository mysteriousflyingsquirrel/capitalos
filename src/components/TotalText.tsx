import React from 'react'

type TotalVariant = 'inflow' | 'outflow' | 'neutral' | 'spare'

export interface TotalTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: TotalVariant
}

const colorMap: Record<TotalVariant, string> = {
  inflow: 'text-success',
  outflow: 'text-danger',
  neutral: 'text-text-primary',
  spare: 'text-[#DAA520]',
}

const TotalText: React.FC<TotalTextProps> = ({ variant, className = '', children, ...rest }) => {
  // Use inline styles to ensure colors are applied (overrides any CSS)
  const colorStyle = variant === 'inflow' 
    ? { color: '#2ECC71' } 
    : variant === 'outflow' 
    ? { color: '#E74C3C' } 
    : variant === 'spare'
    ? { color: '#DAA520' }
    : {}
  
  // Let className control font size (removed text-text1 to avoid specificity issues)
  const classes = `font-normal ${className}`.trim()

  return (
    <span className={classes} style={colorStyle} {...rest}>
      {children}
    </span>
  )
}

export default TotalText


