import React from 'react';

// FIX: Add size prop to ButtonProps to support different button sizes.
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Fix: Converted to a forwardRef component to accept a ref.
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ children, variant = 'primary', size = 'md', className = '', ...props }, ref) => {
  // FIX: Decouple padding from base classes to handle 'size' prop.
  const baseClasses = 'rounded-md font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background';
  
  const variantClasses = {
    primary: 'bg-primary text-white hover:bg-primary-hover focus:ring-primary',
    secondary: 'bg-accent text-text-primary hover:bg-accent-hover focus:ring-accent',
    danger: 'bg-danger text-white hover:bg-red-600 focus:ring-danger',
  };

  // FIX: Define padding classes for different button sizes.
  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };


  return (
    // FIX: Apply size classes and forward the ref.
    <button ref={ref} className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;
