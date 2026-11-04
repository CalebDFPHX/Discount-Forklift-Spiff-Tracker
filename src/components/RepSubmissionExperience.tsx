import React, { useState } from 'react';
import type { SpiffSubmission } from '../lib/repository.js';
import { RepSubmissionForm } from './RepSubmissionForm.js';
import { SubmissionSuccessModal } from './SubmissionSuccessModal.js';

interface RepSubmissionExperienceProps {
  onAdminLoginClick: () => void;
  onRefreshConfig: () => void;
}

export const RepSubmissionExperience: React.FC<RepSubmissionExperienceProps> = ({
  onAdminLoginClick,
  onRefreshConfig,
}) => {
  const [lastSubmitted, setLastSubmitted] = useState<SpiffSubmission | null>(null);
  const [formInstance, setFormInstance] = useState(0);

  const resetForAnotherSubmission = () => {
    setLastSubmitted(null);
    setFormInstance((current) => current + 1);
    onRefreshConfig();
  };

  return (
    <>
      <RepSubmissionForm
        key={formInstance}
        onSubmissionSuccess={setLastSubmitted}
        onAdminLoginClick={onAdminLoginClick}
      />
      {lastSubmitted && (
        <SubmissionSuccessModal
          submission={lastSubmitted}
          onReset={resetForAnotherSubmission}
        />
      )}
    </>
  );
};
