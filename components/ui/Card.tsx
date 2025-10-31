import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

// Fix: Converted to a forwardRef component to accept a ref.
const Card = React.forwardRef<HTMLDivElement, CardProps>(({ children, className = '' }, ref) => {
  return (
    <div ref={ref} className={`bg-content rounded-lg shadow-md p-4 md:p-6 ${className}`}>
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export default Card;
