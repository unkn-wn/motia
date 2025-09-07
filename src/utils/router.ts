// Lightweight hash-based routing helpers for project URLs

const PROJECT_PREFIX = '#/project/';

export function getProjectIdFromHash(): string | null {
  const h = window.location.hash;
  if (h.startsWith(PROJECT_PREFIX)) {
    const id = h.slice(PROJECT_PREFIX.length).trim();
    return id || null;
  }
  return null;
}

export function setProjectHash(projectId: string): void {
  if (!projectId) return;
  const next = `${PROJECT_PREFIX}${projectId}`;
  if (window.location.hash !== next) {
    // Use history.replaceState to avoid growing history for auto updates
    history.replaceState(null, '', next);
  }
}

export function clearHash(): void {
  if (window.location.hash) {
    history.replaceState(null, '', '#/');
  }
}
