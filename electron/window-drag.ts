import type { BrowserWindow, Point, Rectangle } from 'electron';

type MovableWindow = Pick<BrowserWindow, 'getBounds' | 'setBounds' | 'isDestroyed' | 'isFocused' | 'isMaximized' | 'isMinimized' | 'focus'>;

// Keep the starting dimensions instead of repeatedly round-tripping Windows' DPI
// conversions through setPosition, which can enlarge transparent windows over time.
export class WindowDrag {
  private ticker?: ReturnType<typeof setInterval>;
  private origin?: Rectangle;
  private pointer?: Point;
  private last?: Point;
  private activated = false;
  private deadline?: ReturnType<typeof setTimeout>;
  constructor(private window: MovableWindow, private cursor: () => Point) {}
  start(initialPointer?: Point) {
    this.stop();
    if (this.window.isDestroyed() || this.window.isMaximized() || this.window.isMinimized()) return;
    if (!this.window.isFocused()) this.window.focus();
    this.origin = this.window.getBounds(); this.pointer = initialPointer || this.cursor();
    this.last = { x: this.origin.x, y: this.origin.y };
    this.ticker = setInterval(() => {
      if (this.window.isDestroyed() || !this.window.isFocused() || this.window.isMinimized() || this.window.isMaximized()) { this.stop(); return; }
      this.update();
    }, 16);
    this.deadline = setTimeout(() => this.stop(), 30000);
  }
  private update() {
    if (!this.origin || !this.pointer || this.window.isDestroyed() || !this.window.isFocused() || this.window.isMinimized() || this.window.isMaximized()) return;
    const current = this.cursor();
    // Renderer coordinates and screen DIP coordinates can differ slightly at
    // fractional Windows scaling. Do not treat that conversion noise as a drag.
    if (!this.activated) {
      if (Math.hypot(current.x - this.pointer.x, current.y - this.pointer.y) < 6) return;
      this.activated = true;
    }
    const x = Math.round(this.origin.x + current.x - this.pointer.x);
    const y = Math.round(this.origin.y + current.y - this.pointer.y);
    if (this.last?.x === x && this.last.y === y) return;
    this.window.setBounds({ x, y, width: this.origin.width, height: this.origin.height }, false);
    this.last = { x, y };
  }
  stop(flush = false) {
    if (flush) this.update();
    this.origin = undefined; this.pointer = undefined; this.last = undefined;
    this.activated = false;
    clearInterval(this.ticker); clearTimeout(this.deadline);
    this.ticker = undefined; this.deadline = undefined;
  }
}
