import React, { useState, useCallback } from 'react';
import HomeHero from '@components/Home/HomeHero';
import FileDropzone from '@components/FileDropzone';
import AuthModal from '@components/Home/AuthModal';

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

  return (
    <>
      <FileDropzone onFileSelect={onUpload} isLoading={uploading}>
        <HomeHero
          onUpload={onUpload}
          uploading={uploading}
          onOpenSignin={openSignin}
          onOpenSignup={openSignup}
          onSignOut={onSignOut}
        />
      </FileDropzone>
      <AuthModal open={signInOpen} mode="signin" onClose={() => setSignInOpen(false)} />
      <AuthModal open={signUpOpen} mode="signup" onClose={() => setSignUpOpen(false)} />
    </>
  );
};

export default HomeLanding;
