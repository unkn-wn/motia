import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export type HeroBackdropHandle = { shuffle: () => void };
type HeroBackdropProps = React.ComponentPropsWithoutRef<'canvas'>;

// Simplified backdrop: self-animated; supports imperative shuffle to re-randomize bar amplitudes.
const HeroBackdrop = forwardRef<HeroBackdropHandle, HeroBackdropProps>((props, ref) => {
  // Tunables and small helpers
  const TRANSITION_SEC = 0.8; // ease duration for amp/freq retarget
  const TRAVEL_SEC = 1.0; // bottom -> top duration
  const PULSE_STRENGTH = 0.2; // additional amplitude at pulse center

  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const nodesRef = useRef<Array<{ x: number; y: number; r: number; phase: number; speed: number }>>([]);
  const accentRef = useRef<string>('#9ca3af');
  const intensityRef = useRef<number>(0.6);
  const seedsCurrentRef = useRef<Float32Array | null>(null);
  const seedsTargetRef = useRef<Float32Array | null>(null);
  const seedsLerpTRef = useRef<number>(1); // 1 = at target
  const freqCurrentRef = useRef<Float32Array | null>(null);
  const freqTargetRef = useRef<Float32Array | null>(null);
  const angleRef = useRef<Float32Array | null>(null); // integrated per-bar angle
  const pulseRef = useRef<{ pos: number; speed: number; width: number; strength: number; active: boolean } | null>(null);
  const lastSizeRef = useRef<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);

    // Initialize nodes and bar arrays once on mount
    const seedNodes = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const count = Math.max(10, Math.min(28, Math.floor((w * h) / 38000)));
      const nodes: Array<{ x: number; y: number; r: number; phase: number; speed: number }> = [];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * Math.min(w, h) * 0.35;
        nodes.push({
          x: w / 2 + Math.cos(angle) * radius,
          y: h / 2 + Math.sin(angle) * radius,
          r: 1 + Math.random() * 2.5,
          phase: Math.random() * Math.PI * 2,
          speed: 0.25 + Math.random() * 0.6,
        });
      }
      nodesRef.current = nodes;

      // Recreate per-bar amplitude seeds to match forthcoming barCount
      const barCount = Math.max(48, Math.floor(h / 12));
      const seeds = new Float32Array(barCount);
      const freqs = new Float32Array(barCount);
      const angles = new Float32Array(barCount);
      for (let i = 0; i < barCount; i++) {
        seeds[i] = 1.0; // baseline amplitude; pulse will modulate on hover
        freqs[i] = 0.85 + Math.random() * 0.5; // 0.85..1.35 frequency multiplier
        angles[i] = Math.random() * Math.PI * 2; // initial angle
      }
      seedsCurrentRef.current = seeds;
      seedsTargetRef.current = new Float32Array(seeds);
      freqCurrentRef.current = freqs;
      freqTargetRef.current = new Float32Array(freqs);
      angleRef.current = angles;
      seedsLerpTRef.current = 1;
    };

    // Resize canvas without reseeding; scale existing node positions to new size
    const resize = () => {
      const prev = lastSizeRef.current;
      const { clientWidth, clientHeight } = canvas;
      canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      if (prev) {
        const sx = clientWidth > 0 && prev.w > 0 ? clientWidth / prev.w : 1;
        const sy = clientHeight > 0 && prev.h > 0 ? clientHeight / prev.h : 1;
        if (sx !== 1 || sy !== 1) {
          const nodes = nodesRef.current;
          for (let i = 0; i < nodes.length; i++) {
            nodes[i].x *= sx;
            nodes[i].y *= sy;
          }
        }
      }
      lastSizeRef.current = { w: clientWidth, h: clientHeight };
    };

    let lastTs = 0;
    const draw = (ts: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      // Throttle to ~30fps
      if (ts - lastTs < 33) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      ctx.clearRect(0, 0, w, h);

      // Soft vignette
      const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.min(w, h) * 0.75);
      grad.addColorStop(0, 'rgba(255,255,255,0.06)');
      grad.addColorStop(1, 'rgba(0,0,0,0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Vertical waveform column (centered), inspired by app visuals
      const colW = Math.max(80, Math.min(160, w * 0.1));
      const colX = (w - colW) / 2;
      const barCount = Math.max(48, Math.floor(h / 12));
      const barH = h / barCount;
      const gain = Math.max(0, Math.min(1, intensityRef.current));

      // Prepare seeds (smoothly lerp toward target with easing)
      let seedsCurrent = seedsCurrentRef.current;
      let seedsTarget = seedsTargetRef.current;
      let freqCurrent = freqCurrentRef.current;
      let freqTarget = freqTargetRef.current;
      let angles = angleRef.current;

      // Helper to resize typed arrays while preserving values to minimize visual jumps
      const ensureSize = (arr: Float32Array | null, newLen: number, def: number): Float32Array => {
        if (!arr) {
          const next = new Float32Array(newLen);
          for (let i = 0; i < newLen; i++) next[i] = def;
          return next;
        }
        if (arr.length === newLen) return arr;
        const next = new Float32Array(newLen);
        const minLen = Math.min(arr.length, newLen);
        next.set(arr.subarray(0, minLen));
        if (newLen > arr.length) {
          const fill = arr.length ? arr[arr.length - 1] : def;
          for (let i = arr.length; i < newLen; i++) next[i] = fill;
        }
        return next;
      };

      seedsCurrent = ensureSize(seedsCurrent ?? null, barCount, 1.0);
      seedsTarget = ensureSize(seedsTarget ?? null, barCount, 1.0);
      freqCurrent = ensureSize(freqCurrent ?? null, barCount, 1.0);
      freqTarget = ensureSize(freqTarget ?? null, barCount, 1.0);
      angles = ensureSize(angles ?? null, barCount, 0.0);

      seedsCurrentRef.current = seedsCurrent;
      seedsTargetRef.current = seedsTarget;
      freqCurrentRef.current = freqCurrent;
      freqTargetRef.current = freqTarget;
      angleRef.current = angles;

      if (seedsLerpTRef.current < 1) {
        const speed = 1 / TRANSITION_SEC;
        seedsLerpTRef.current = Math.min(1, seedsLerpTRef.current + dt * speed);
      }
      const tLinear = seedsLerpTRef.current;
      const lerpT = easeOutCubic(tLinear);
      const pulse = pulseRef.current;

      for (let i = 0; i < barCount; i++) {
        // Smooth per-bar amplitude and oscillation parameters
        const seed = seedsCurrent[i] * (1 - lerpT) + seedsTarget[i] * lerpT;
        const freq = freqCurrent[i] * (1 - lerpT) + freqTarget[i] * lerpT;
        // Integrate angle with per-frame dt to avoid time-based jumps
        const omega = (1.0 + 0.5 * gain) * freq;
        angles[i] += dt * omega;
        // Keep angle in a stable range to prevent overflow
        if (angles[i] > Math.PI) angles[i] -= Math.PI * 2;
        else if (angles[i] < -Math.PI) angles[i] += Math.PI * 2;

        const base = angles[i];
        const ampBase = 0.25 + (0.55 + 0.35 * gain) * Math.abs(Math.sin(base));
        // Pulse factor: triangular window centered at pulse.pos moving bottom->top
        let pulseFactor = 1;
        if (pulse && pulse.active) {
          const delta = i - pulse.pos;
          const t = 1 - Math.abs(delta) / Math.max(1, pulse.width);
          const shaped = t > 0 ? t * t : 0; // quadratic falloff
          pulseFactor = 1 + (pulse.strength ?? 0.35) * shaped;
        }
        const amp = ampBase * seed * pulseFactor;
        const width = Math.max(6, colW * Math.min(1.35, amp));
        const x = colX + (colW - width) / 2;
        const y = i * barH;
        // background bar
        ctx.fillStyle = 'rgba(64,64,64,0.6)';
        ctx.fillRect(x, y, width, barH - 3);
        // dotted border accent
        // accent-tinted dotted border
        ctx.strokeStyle = `${accentRef.current}55`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.strokeRect(x + 0.5, y + 0.5, width - 1, barH - 4);
        ctx.setLineDash([]);
      }
      // Advance pulse upwards (decreasing index)
      if (pulseRef.current && pulseRef.current.active) {
        const p = pulseRef.current;
        p.pos -= (p.speed || 0) * dt;
        if (p.pos < -((p.width || 0) * 2)) {
          p.active = false;
        }
      }

      // Drifting nodes and dotted connectors
      const nodes = nodesRef.current;
      const cx = w / 2;
      const cy = h / 2;
      // Pre-pass: motion update
      for (const node of nodes) {
        node.phase += 0.01 * node.speed;
        const dx = Math.cos(node.phase) * 0.6;
        const dy = Math.sin(node.phase * 1.1) * 0.6;
        node.x += dx;
        node.y += dy;
        // No pointer or attractor coupling
      }
      // Connect nodes that are close; draw dotted lines, occasional pulse
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < Math.min(w, h) * 0.22) {
            const alpha = Math.max(0, 0.25 - (dist / (Math.min(w, h) * 0.22)) * 0.25);
            // connectors between nodes with accent tint
            ctx.strokeStyle = `${accentRef.current}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 6]);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
      // Lines to center
      for (const n of nodes) {
        const dist = Math.hypot(n.x - cx, n.y - cy);
        const alpha = Math.max(0, 0.18 - dist / Math.max(w, h) * 0.18);
        if (alpha > 0) {
          ctx.strokeStyle = `${accentRef.current}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
          ctx.setLineDash([4, 8]);
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(cx, cy);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // Nodes (soft glow)
      const sparkIndex = Math.floor((ts / 800) % Math.max(1, nodes.length));
      for (let idx = 0; idx < nodes.length; idx++) {
        const n = nodes[idx];
        const isSpark = idx === sparkIndex;
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, Math.max(8, n.r * 8));
        g.addColorStop(0, isSpark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(1, n.r), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = isSpark ? 'rgba(243,244,246,1)' : '#bfbfbf';
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(0.8, n.r * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const onResize = () => resize();
    // First layout pass
    resize();
    // Seed initial state once (do not reseed on subsequent resizes)
    if (!nodesRef.current.length) seedNodes();
    rafRef.current = requestAnimationFrame(draw);
    window.addEventListener('resize', onResize);
    // No pointer listeners; backdrop is independent

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Imperative shuffle: trigger a bottom->top amplitude pulse (no randomization)
  useImperativeHandle(ref, () => ({
    shuffle() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const h = canvas.clientHeight;
      const barCount = Math.max(48, Math.floor(h / 12));
      // Configure pulse starting at the bottom bar and moving upward
      const width = Math.max(4, Math.floor(barCount * 0.14)); // bars spanned by pulse
      const speed = barCount / Math.max(0.2, TRAVEL_SEC); // bars per second
      pulseRef.current = { pos: barCount - 1, speed, width, strength: PULSE_STRENGTH, active: true };
    }
  }), []);

  return (
    <canvas
      ref={canvasRef}
      {...props}
      className={`absolute inset-0 w-full h-full pointer-events-none${props.className ? ` ${props.className}` : ''}`}
      aria-hidden="true"
    />
  );
});

export default HeroBackdrop;
