"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import type {
  BrainHemisphereModel,
  BrainModelPayload,
} from "@/lib/dopa-api";

type DecodedHemisphere = {
  hemisphere: "left" | "right";
  vertexCount: number;
  positions: Float32Array;
  indices: Uint32Array;
  responses: Uint8Array;
};

type DecodeResult =
  | { data: DecodedHemisphere[]; error: null }
  | { data: null; error: string };

const LOW_COLOR = [0.055, 0.075, 0.115] as const;
const VIOLET_COLOR = [0.38, 0.3, 0.98] as const;
const CYAN_COLOR = [0.08, 0.82, 1] as const;
const AMBER_COLOR = [1, 0.49, 0.16] as const;

function decodeBytes(value: string): Uint8Array {
  const decoded = window.atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function decodeHemisphere(
  item: BrainHemisphereModel,
  frameCount: number,
): DecodedHemisphere {
  const positionBytes = decodeBytes(item.positions_f32);
  const indexBytes = decodeBytes(item.indices_u32);
  const responseBytes = decodeBytes(item.responses_u8);
  if (
    positionBytes.byteLength !== item.vertex_count * 3 * Float32Array.BYTES_PER_ELEMENT ||
    indexBytes.byteLength % (3 * Uint32Array.BYTES_PER_ELEMENT) !== 0 ||
    responseBytes.byteLength !== item.vertex_count * frameCount
  ) {
    throw new Error("The cortical model contains inconsistent geometry.");
  }
  const positions = new Float32Array(positionBytes.buffer);
  const indices = new Uint32Array(indexBytes.buffer);
  if (
    positions.some(
      (value) => !Number.isFinite(value) || Math.abs(value) > 1_000_000,
    ) ||
    indices.some((value) => value >= item.vertex_count)
  ) {
    throw new Error("The cortical model contains unsafe geometry.");
  }

  return {
    hemisphere: item.hemisphere,
    vertexCount: item.vertex_count,
    positions,
    indices,
    responses: responseBytes,
  };
}

function orientAndCenter(hemispheres: DecodedHemisphere[]): void {
  let minimumX = Infinity;
  let minimumY = Infinity;
  let minimumZ = Infinity;
  let maximumX = -Infinity;
  let maximumY = -Infinity;
  let maximumZ = -Infinity;

  for (const hemisphere of hemispheres) {
    for (let index = 0; index < hemisphere.vertexCount; index += 1) {
      const offset = index * 3;
      const x = hemisphere.positions[offset];
      const y = hemisphere.positions[offset + 2];
      const z = -hemisphere.positions[offset + 1];
      hemisphere.positions[offset] = x;
      hemisphere.positions[offset + 1] = y;
      hemisphere.positions[offset + 2] = z;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      minimumZ = Math.min(minimumZ, z);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
      maximumZ = Math.max(maximumZ, z);
    }
  }

  const centerX = (minimumX + maximumX) * 0.5;
  const centerY = (minimumY + maximumY) * 0.5;
  const centerZ = (minimumZ + maximumZ) * 0.5;
  for (const hemisphere of hemispheres) {
    for (let index = 0; index < hemisphere.positions.length; index += 3) {
      hemisphere.positions[index] -= centerX;
      hemisphere.positions[index + 1] -= centerY;
      hemisphere.positions[index + 2] -= centerZ;
    }
  }
}

function decodeModel(model: BrainModelPayload): DecodeResult {
  try {
    if (
      model.version !== 1 ||
      model.frame_count < 1 ||
      model.hemispheres.length !== 2
    ) {
      throw new Error("The cortical model version is not supported.");
    }
    const hemispheres = model.hemispheres.map((item) =>
      decodeHemisphere(item, model.frame_count),
    );
    orientAndCenter(hemispheres);
    return { data: hemispheres, error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "The cortical model could not be prepared.",
    };
  }
}

function mixChannel(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function writeResponseColor(
  target: Float32Array,
  offset: number,
  value: number,
): void {
  const scaled = Math.pow(value / 255, 0.78);
  if (scaled < 0.38) {
    const amount = scaled / 0.38;
    target[offset] = mixChannel(LOW_COLOR[0], VIOLET_COLOR[0], amount);
    target[offset + 1] = mixChannel(
      LOW_COLOR[1],
      VIOLET_COLOR[1],
      amount,
    );
    target[offset + 2] = mixChannel(
      LOW_COLOR[2],
      VIOLET_COLOR[2],
      amount,
    );
  } else if (scaled < 0.72) {
    const amount = (scaled - 0.38) / 0.34;
    target[offset] = mixChannel(VIOLET_COLOR[0], CYAN_COLOR[0], amount);
    target[offset + 1] = mixChannel(
      VIOLET_COLOR[1],
      CYAN_COLOR[1],
      amount,
    );
    target[offset + 2] = mixChannel(
      VIOLET_COLOR[2],
      CYAN_COLOR[2],
      amount,
    );
  } else {
    const amount = (scaled - 0.72) / 0.28;
    target[offset] = mixChannel(CYAN_COLOR[0], AMBER_COLOR[0], amount);
    target[offset + 1] = mixChannel(
      CYAN_COLOR[1],
      AMBER_COLOR[1],
      amount,
    );
    target[offset + 2] = mixChannel(
      CYAN_COLOR[2],
      AMBER_COLOR[2],
      amount,
    );
  }
}

function CortexSurface({
  surface,
  frame,
}: {
  surface: DecodedHemisphere;
  frame: number;
}) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute(
      "position",
      new THREE.BufferAttribute(surface.positions, 3),
    );
    next.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(surface.vertexCount * 3), 3),
    );
    next.setIndex(new THREE.BufferAttribute(surface.indices, 1));
    next.computeVertexNormals();
    next.computeBoundingSphere();
    return next;
  }, [surface.indices, surface.positions, surface.vertexCount]);

  useEffect(() => {
    const colorAttribute = geometry.getAttribute(
      "color",
    ) as THREE.BufferAttribute;
    const colorValues = colorAttribute.array as Float32Array;
    const responseOffset = frame * surface.vertexCount;
    for (let vertex = 0; vertex < surface.vertexCount; vertex += 1) {
      writeResponseColor(
        colorValues,
        vertex * 3,
        surface.responses[responseOffset + vertex],
      );
    }
    colorAttribute.needsUpdate = true;
  }, [frame, geometry, surface.responses, surface.vertexCount]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh geometry={geometry} renderOrder={1}>
        <meshStandardMaterial
          vertexColors
          transparent
          opacity={0.86}
          roughness={0.46}
          metalness={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={geometry} renderOrder={2}>
        <meshBasicMaterial
          color="#cbd5ff"
          wireframe
          transparent
          opacity={0.075}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function strongestVertices(
  surface: DecodedHemisphere,
  frameCount: number,
  count: number,
): number[] {
  const peaks = new Uint8Array(surface.vertexCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frame * surface.vertexCount;
    for (let vertex = 0; vertex < surface.vertexCount; vertex += 1) {
      peaks[vertex] = Math.max(peaks[vertex], surface.responses[offset + vertex]);
    }
  }

  const ranked = Array.from(
    { length: surface.vertexCount },
    (_, index) => index,
  ).sort((left, right) => peaks[right] - peaks[left]);
  const chosen: number[] = [];
  for (const candidate of ranked) {
    const offset = candidate * 3;
    const point = new THREE.Vector3(
      surface.positions[offset],
      surface.positions[offset + 1],
      surface.positions[offset + 2],
    );
    const separated = chosen.every((selected) => {
      const selectedOffset = selected * 3;
      return (
        point.distanceTo(
          new THREE.Vector3(
            surface.positions[selectedOffset],
            surface.positions[selectedOffset + 1],
            surface.positions[selectedOffset + 2],
          ),
        ) > 24
      );
    });
    if (separated) chosen.push(candidate);
    if (chosen.length === count) break;
  }
  return chosen;
}

type SignalRoute = {
  points: THREE.Vector3[];
  color: string;
};

function createSignalRoutes(
  hemispheres: DecodedHemisphere[],
  frameCount: number,
): SignalRoute[] {
  return hemispheres.flatMap((surface, hemisphereIndex) =>
    strongestVertices(surface, frameCount, 9).map((vertex, lineIndex) => {
      const offset = vertex * 3;
      const end = new THREE.Vector3(
        surface.positions[offset],
        surface.positions[offset + 1],
        surface.positions[offset + 2],
      );
      const direction = end.clone().normalize();
      const curl = new THREE.Vector3(
        Math.sin(lineIndex * 1.7 + hemisphereIndex) * 13,
        Math.cos(lineIndex * 1.1) * 10,
        Math.sin(lineIndex * 0.8) * 12,
      );
      const start = new THREE.Vector3(
        hemisphereIndex === 0 ? -3 : 3,
        -5,
        2,
      );
      const curve = new THREE.CatmullRomCurve3([
        start,
        start.clone().lerp(end, 0.32).add(curl),
        start
          .clone()
          .lerp(end, 0.68)
          .add(curl.clone().multiplyScalar(-0.42)),
        end.clone().sub(direction.multiplyScalar(1.2)),
      ]);
      return {
        points: curve.getPoints(42),
        color:
          lineIndex % 3 === 0
            ? "#ff8a3d"
            : lineIndex % 2 === 0
              ? "#2edcff"
              : "#8b7cff",
      };
    }),
  );
}

function SignalTrace({
  route,
  index,
  reducedMotion,
}: {
  route: SignalRoute;
  index: number;
  reducedMotion: boolean;
}) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(route.points);
    const material = new THREE.LineBasicMaterial({
        color: route.color,
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      });
    const next = new THREE.Line(geometry, material);
    next.renderOrder = 4;
    return next;
  }, [route]);
  const lineRef = useRef(line);

  useFrame(({ clock }) => {
    const current = lineRef.current;
    const total = current.geometry.getAttribute("position").count;
    if (reducedMotion) {
      current.geometry.setDrawRange(0, total);
      current.material.opacity = 0.5;
      return;
    }
    const cycle = (clock.elapsedTime * 0.3 + index * 0.11) % 1.35;
    const progress = Math.min(cycle, 1);
    current.geometry.setDrawRange(0, Math.max(2, Math.floor(total * progress)));
    current.material.opacity = cycle > 1 ? (1.35 - cycle) / 0.35 : 0.72;
  });

  useEffect(
    () => () => {
      line.geometry.dispose();
      line.material.dispose();
    },
    [line],
  );

  return <primitive object={line} />;
}

function SignalNetwork({
  hemispheres,
  frameCount,
  reducedMotion,
}: {
  hemispheres: DecodedHemisphere[];
  frameCount: number;
  reducedMotion: boolean;
}) {
  const routes = useMemo(
    () => createSignalRoutes(hemispheres, frameCount),
    [frameCount, hemispheres],
  );

  return (
    <group>
      {routes.map((route, index) => (
        <SignalTrace
          key={`${route.color}-${index}`}
          route={route}
          index={index}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function CortexScene({
  hemispheres,
  frame,
  frameCount,
  playing,
}: {
  hemispheres: DecodedHemisphere[];
  frame: number;
  frameCount: number;
  playing: boolean;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <>
      <ambientLight intensity={0.72} />
      <hemisphereLight args={["#b8c7ff", "#08090f", 1.15]} />
      <directionalLight position={[120, 80, 100]} intensity={2.2} color="#9faeff" />
      <directionalLight position={[-100, -40, 60]} intensity={1.3} color="#27d9ff" />
      <group rotation={[0, -0.08, -0.04]}>
        {hemispheres.map((surface) => (
          <CortexSurface
            key={surface.hemisphere}
            surface={surface}
            frame={frame}
          />
        ))}
        <SignalNetwork
          hemispheres={hemispheres}
          frameCount={frameCount}
          reducedMotion={reducedMotion}
        />
      </group>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.065}
        minDistance={125}
        maxDistance={340}
        autoRotate={playing && !reducedMotion}
        autoRotateSpeed={0.34}
        target={[0, 0, 0]}
      />
    </>
  );
}

export function CorticalModelViewer({ model }: { model: BrainModelPayload }) {
  const decoded = useMemo(() => decodeModel(model), [model]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(model.frame_count > 1);

  useEffect(() => {
    if (!playing || model.frame_count <= 1) return;
    const interval = window.setInterval(
      () => setFrame((current) => (current + 1) % model.frame_count),
      Math.max(500, model.frame_interval_seconds * 1000),
    );
    return () => window.clearInterval(interval);
  }, [model.frame_count, model.frame_interval_seconds, playing]);

  if (decoded.error || !decoded.data) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center px-6 text-center text-[12px] leading-5 text-secondary">
        {decoded.error}
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-[16/9] overflow-hidden bg-[radial-gradient(circle_at_58%_40%,rgba(50,75,124,0.24),transparent_34%),radial-gradient(circle_at_35%_64%,rgba(93,63,168,0.18),transparent_42%),#06080d]">
        <Canvas
          dpr={[1, 1.7]}
          camera={{ position: [188, 30, 22], fov: 35, near: 0.1, far: 800 }}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
          }}
        >
          <CortexScene
            hemispheres={decoded.data}
            frame={frame}
            frameCount={model.frame_count}
            playing={playing}
          />
        </Canvas>

        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-white/[0.08] bg-black/35 px-3 py-2 backdrop-blur-md">
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/45">
            Relative response
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[9px] text-white/45">Low</span>
            <span className="h-1.5 w-24 rounded-full bg-[linear-gradient(90deg,#131a2a_0%,#6851f1_38%,#21d7f2_70%,#ff7c2e_100%)]" />
            <span className="text-[9px] text-white/45">High</span>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 right-4 rounded-full border border-white/[0.08] bg-black/35 px-2.5 py-1 text-[9px] text-white/45 backdrop-blur-md">
          Drag to rotate · Scroll to zoom
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-white/[0.07] bg-[#090b10] px-4 py-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          className="inline-flex w-20 shrink-0 items-center justify-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[10px] text-white/70 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
          {playing ? "Pause" : "Play"}
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-3">
          <span className="sr-only">Cortical response time</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, model.frame_count - 1)}
            value={frame}
            onChange={(event) => {
              setPlaying(false);
              setFrame(Number(event.currentTarget.value));
            }}
            className="h-1 w-full cursor-pointer accent-[#7f73ff]"
          />
          <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-white/55">
            {Math.round(frame * model.frame_interval_seconds)}s
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-1.5 text-[9px] text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2edcff] shadow-[0_0_8px_#2edcff]" />
          Stylized signal traces
        </div>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
      <path d="M3 2.2v7.6L9.5 6 3 2.2Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
      <path d="M3 2h2.2v8H3V2Zm3.8 0H9v8H6.8V2Z" />
    </svg>
  );
}
