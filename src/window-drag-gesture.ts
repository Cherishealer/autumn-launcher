import type { Api } from '../shared/types';

interface Gesture { pointer: number; x: number; y: number; dragging: boolean }

// A press is only a candidate: clicking or releasing within the movement slop
// must never send native window mutation requests, including on rapid clicks.
export class WindowDragGesture {
  private current?: Gesture;
  constructor(private send: Api['window']) {}
  press(pointer: number, x: number, y: number) {
    this.release();
    this.current = { pointer, x, y, dragging: false };
  }
  move(pointer: number, x: number, y: number) {
    const gesture = this.current;
    if (!gesture || gesture.pointer !== pointer || gesture.dragging || Math.hypot(x - gesture.x, y - gesture.y) < 6) return;
    gesture.dragging = true;
    void this.send('drag-start', { x: gesture.x, y: gesture.y }).catch(() => {
      if (this.current === gesture) this.current = undefined;
    });
  }
  release(pointer?: number) {
    const gesture = this.current;
    if (!gesture || pointer !== undefined && gesture.pointer !== pointer) return;
    this.current = undefined;
    if (gesture.dragging) void this.send('drag-stop').catch(() => {});
  }
}
