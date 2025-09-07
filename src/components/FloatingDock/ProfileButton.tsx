import { memo } from 'react';
import { UserIcon } from '@/assets/icons';

interface ProfileButtonProps {
  onOpenProfile: () => void;
}

const ProfileButton = memo<ProfileButtonProps>(({ onOpenProfile }) => (
  <button
    onClick={onOpenProfile}
    className="group cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white rounded-full p-3 shadow-md transition-all duration-300"
    title="Profile"
  >
    <UserIcon className="w-5 h-5" />
  </button>
));

ProfileButton.displayName = 'ProfileButton';

export default ProfileButton;
