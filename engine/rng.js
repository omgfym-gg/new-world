// 可重現的種子亂數（mulberry32）。所有隨機性都必須經過這裡，狀態存在世界資料中，存檔後可繼續重現。
(function (root) {
  const WS = (root.WS = root.WS || {});

  function hashSeed(str) {
    str = String(str);
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  class RNG {
    constructor(state) { this.s = state >>> 0; }
    next() {
      this.s = (this.s + 0x6d2b79f5) >>> 0;
      let t = this.s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    normal(mean = 0, sd = 1) {
      const u = Math.max(1e-12, this.next());
      const v = this.next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  }

  WS.RNG = RNG;
  WS.hashSeed = hashSeed;
})(typeof window !== 'undefined' ? window : globalThis);
