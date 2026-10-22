import type { BrowserWindow, Point } from 'electron';

type MovableWindow = Pick<BrowserWindow, 'getPosition' | 'setPosition' | 'isDestroyed' | 'isFocused' | 'isMaximized' | 'isMinimized' | 'focus'>;

// Track the OS cursor in DIP coordinates so dragging remains consistent across
// Windows display scaling levels and mixed-DPI monitors.
export class WindowDrag {
  private ticker?: ReturnType<typeof setInterval>;
  private origin?: number[];
  private pointer?: Point;
  private deadline?: ReturnType<typeof setTimeout>;
  constructor(private window: MovableWindow, private cursor: () => Point) {}
  start(initialPointer?: Point) {
    this.stop();
    if (this.window.isDestroyed() || this.window.isMaximized()) return;
    if (!this.window.isFocused()) this.window.focus();
    this.origin = this.window.getPosition(); this.pointer = initialPointer || this.cursor();
    this.ticker = setInterval(() => {
      if (this.window.isDestroyed() || !this.window.isFocused() || this.window.isMinimized()) { this.stop(); return; }
      this.update();
    }, 16);
    this.deadline = setTimeout(() => this.stop(), 30000);
  }
  private update() {
    if (!this.origin || !this.pointer || this.window.isDestroyed()) return;
    const current = this.cursor();
    this.window.setPosition(Math.round(this.origin[0] + current.x - this.pointer.x), Math.round(this.origin[1] + current.y - this.pointer.y));
  }
  stop(flush = false) {
    if (flush) this.update();
    this.origin = undefined; this.pointer = undefined;
    clearInterval(this.ticker); clearTimeout(this.deadline);
    this.ticker = undefined; this.deadline = undefined;
  }
}
