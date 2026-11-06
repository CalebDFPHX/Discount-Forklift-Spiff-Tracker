import React from 'react';

export const PandadocsConfirmation: React.FC<{ value?: boolean }> = ({ value }) => (
  <>{value === true ? 'Yes' : 'Not recorded'}</>
);
