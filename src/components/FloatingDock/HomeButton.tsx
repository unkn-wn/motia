import { memo } from 'react';
import { HomeIcon } from '@/assets/icons';

interface HomeButtonProps {
  onGoHome: () => void;
  disabled?: boolean;
}

const HomeButton = memo<HomeButtonProps>(({ onGoHome, disabled }) => (
  <button
    onClick={onGoHome}
    className={`group bg-neutral-800 ${!disabled ? 'hover:bg-neutral-700 cursor-pointer' : ''} text-white rounded-full p-3 shadow-md transition-all duration-300 disabled:opacity-60`}
    title={disabled ? 'Sign in to access Projects' : 'Projects'}
    disabled={disabled}
  >
    <HomeIcon className="w-5 h-5" />
  </button>
));

HomeButton.displayName = 'HomeButton';

export default HomeButton;
