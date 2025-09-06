// Map Firebase Auth error codes to friendly messages
export function getAuthErrorMessage(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : '';
  const message = typeof err === 'object' && err && 'message' in err ? String((err as { message?: unknown }).message) : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/missing-password':
      return 'Please enter a password.';
    case 'auth/weak-password':
      return 'Password is too weak. Try a stronger one.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/requires-recent-login':
      return 'Please sign in again to continue.';
    case 'auth/credential-already-in-use':
      return 'These credentials are already linked to another account.';
    default:
      // Fallback to Firebase message if present, else generic
      return message || 'Authentication failed. Please try again.';
  }
}
