import { defaultProject } from '../model/defaults';
import type { Project } from '../model/types';
import { loadStored, projectFromHash, store } from './persist';

function initial(): { project: Project; fromLink: boolean } {
  const shared = typeof location !== 'undefined' ? projectFromHash(location.hash) : null;
  if (shared) {
    history.replaceState(null, '', location.pathname + location.search);
    return { project: shared, fromLink: true };
  }
  return { project: loadStored() ?? defaultProject(), fromLink: false };
}

const init = initial();

export const app = $state({
  project: init.project,
  activeShelf: 0,
  toast: init.fromLink ? 'action.sharedLoaded' : '',
});

export function replaceProject(p: Project): void {
  app.project = p;
  app.activeShelf = 0;
}

export function save(): void {
  store($state.snapshot(app.project) as Project);
}
