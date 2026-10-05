export const READING = Symbol('reading overlays');
export class ReadingState {
  detail = $state(false);
  viewer = $state(false);
  get paused() {
    return this.detail || this.viewer;
  }
}
