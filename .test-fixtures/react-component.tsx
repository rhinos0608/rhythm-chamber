
import React from 'react';

interface Props {
  title: string;
}

export const TestComponent: React.FC<Props> = ({ title }) => {
  return <div>{title}</div>;
};

// Dynamic import example
const loadComponent = async () => {
  const module = await import('./other-component');
  return module.OtherComponent;
};
