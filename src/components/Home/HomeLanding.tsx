import React, { useState, useCallback } from 'react';
import HomeHero from '@components/Home/HomeHero';
import FileDropzone from '@components/FileDropzone';
import AuthModal from '@components/Home/AuthModal';
import { useStoryboardImport } from '@/features/storyboard/io/useImport';
import { ImportErrorsModal } from '@/features/storyboard/io/ImportControls';

interface Props {
  onUpload: (file: File) => void;
  uploading: boolean;
  onSignOut: () => Promise<void> | void;
}

const HomeLanding: React.FC<Props> = ({ onUpload, uploading, onSignOut }) => {
  const [signInOpen, setSignInOpen] = useState(false);
  const [signUpOpen, setSignUpOpen] = useState(false);

  const openSignin = useCallback(() => setSignInOpen(true), []);
  const openSignup = useCallback(() => setSignUpOpen(true), []);
  const { importFile, busy: importing, errors: importErrors, clearErrors } = useStoryboardImport();

  return (
    <>
      <FileDropzone onFileSelect={onUpload} isLoading={uploading || importing}>
        <HomeHero
          onUpload={onUpload}
          uploading={uploading || importing}
          onOpenSignin={openSignin}
          onOpenSignup={openSignup}
          onSignOut={onSignOut}
          onImport={importFile}
          importing={importing || uploading}
        />
      </FileDropzone>
      <AuthModal open={signInOpen} mode="signin" onClose={() => setSignInOpen(false)} />
      <AuthModal open={signUpOpen} mode="signup" onClose={() => setSignUpOpen(false)} />
      <ImportErrorsModal errors={importErrors} onClose={clearErrors} />
    </>
  );
};

export default HomeLanding;
