import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/auth";

/**
 * Three.js dot-matrix shader backdrop with a real sign-in / sign-up form
 * on top of it.
 *
 * Previously this component shipped a fake email → 6-digit-code flow that
 * never talked to the backend. That's why the demo account never got a
 * code: there was no code, and the step was a dead-end. This version
 * uses the real AuthProvider (email + password) and the shader's reverse
 * reveal plays only after a successful login.
 */

type Uniforms = {
  [key: string]: {
    value: number[] | number[][] | number;
    type: string;
  };
};

interface SignInPageProps {
  className?: string;
}

const DEMO_EMAIL = "demo@finlink.dev";
const DEMO_PASSWORD = "demo1234";

export const CanvasRevealEffect = ({
  animationSpeed = 10,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  colors = [[0, 255, 255]],
  containerClassName,
  dotSize,
  showGradient = true,
  reverse = false,
}: {
  animationSpeed?: number;
  opacities?: number[];
  colors?: number[][];
  containerClassName?: string;
  dotSize?: number;
  showGradient?: boolean;
  reverse?: boolean;
}) => {
  return (
    <div className={cn("h-full relative w-full", containerClassName)}>
      <div className="h-full w-full">
        <DotMatrix
          colors={colors ?? [[0, 255, 255]]}
          dotSize={dotSize ?? 3}
          opacities={opacities}
          shader={`${reverse ? "u_reverse_active" : "false"}_;animation_speed_factor_${animationSpeed.toFixed(1)}_;`}
          center={["x", "y"]}
        />
      </div>
      {showGradient && (
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      )}
    </div>
  );
};

interface DotMatrixProps {
  colors?: number[][];
  opacities?: number[];
  totalSize?: number;
  dotSize?: number;
  shader?: string;
  center?: ("x" | "y")[];
}

const DotMatrix: React.FC<DotMatrixProps> = ({
  colors = [[0, 0, 0]],
  opacities = [0.04, 0.04, 0.04, 0.04, 0.04, 0.08, 0.08, 0.08, 0.08, 0.14],
  totalSize = 20,
  dotSize = 2,
  shader = "",
  center = ["x", "y"],
}) => {
  const uniforms = useMemo(() => {
    let colorsArray = [colors[0], colors[0], colors[0], colors[0], colors[0], colors[0]];
    if (colors.length === 2) {
      colorsArray = [colors[0], colors[0], colors[0], colors[1], colors[1], colors[1]];
    } else if (colors.length === 3) {
      colorsArray = [colors[0], colors[0], colors[1], colors[1], colors[2], colors[2]];
    }
    return {
      u_colors: {
        value: colorsArray.map((color) => [color[0] / 255, color[1] / 255, color[2] / 255]),
        type: "uniform3fv",
      },
      u_opacities: { value: opacities, type: "uniform1fv" },
      u_total_size: { value: totalSize, type: "uniform1f" },
      u_dot_size: { value: dotSize, type: "uniform1f" },
      u_reverse: { value: shader.includes("u_reverse_active") ? 1 : 0, type: "uniform1i" },
    };
  }, [colors, opacities, totalSize, dotSize, shader]);

  return (
    <Shader
      source={`
        precision mediump float;
        in vec2 fragCoord;
        uniform float u_time;
        uniform float u_opacities[10];
        uniform vec3 u_colors[6];
        uniform float u_total_size;
        uniform float u_dot_size;
        uniform vec2 u_resolution;
        uniform int u_reverse;
        out vec4 fragColor;
        float PHI = 1.61803398874989484820459;
        float random(vec2 xy) { return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x); }
        void main() {
            vec2 st = fragCoord.xy;
            ${center.includes("x") ? "st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));" : ""}
            ${center.includes("y") ? "st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));" : ""}
            float opacity = step(0.0, st.x);
            opacity *= step(0.0, st.y);
            vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));
            float frequency = 5.0;
            float show_offset = random(st2);
            float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
            opacity *= u_opacities[int(rand * 10.0)];
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));
            vec3 color = u_colors[int(show_offset * 6.0)];
            float animation_speed_factor = 0.5;
            vec2 center_grid = u_resolution / 2.0 / u_total_size;
            float dist_from_center = distance(center_grid, st2);
            float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);
            float max_grid_dist = distance(center_grid, vec2(0.0, 0.0));
            float timing_offset_outro = (max_grid_dist - dist_from_center) * 0.02 + (random(st2 + 42.0) * 0.2);
            float current_timing_offset;
            if (u_reverse == 1) {
                current_timing_offset = timing_offset_outro;
                opacity *= 1.0 - step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            } else {
                current_timing_offset = timing_offset_intro;
                opacity *= step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((1.0 - step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            }
            fragColor = vec4(color, opacity);
            fragColor.rgb *= fragColor.a;
        }`}
      uniforms={uniforms}
    />
  );
};

const ShaderMaterial = ({ source, uniforms }: { source: string; uniforms: Uniforms }) => {
  const { size } = useThree();
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const material = ref.current.material as THREE.ShaderMaterial;
    material.uniforms.u_time.value = clock.getElapsedTime();
  });

  const getUniforms = () => {
    const prepared: Record<string, { value: unknown; type?: string }> = {};
    for (const name in uniforms) {
      const u = uniforms[name];
      switch (u.type) {
        case "uniform1f": prepared[name] = { value: u.value, type: "1f" }; break;
        case "uniform1i": prepared[name] = { value: u.value, type: "1i" }; break;
        case "uniform1fv": prepared[name] = { value: u.value, type: "1fv" }; break;
        case "uniform3fv":
          prepared[name] = {
            value: (u.value as number[][]).map((v) => new THREE.Vector3().fromArray(v)),
            type: "3fv",
          };
          break;
      }
    }
    prepared["u_time"] = { value: 0, type: "1f" };
    prepared["u_resolution"] = { value: new THREE.Vector2(size.width * 2, size.height * 2) };
    return prepared;
  };

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        precision mediump float;
        in vec2 coordinates;
        uniform vec2 u_resolution;
        out vec2 fragCoord;
        void main(){
          gl_Position = vec4(position.x, position.y, 0.0, 1.0);
          fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution;
          fragCoord.y = u_resolution.y - fragCoord.y;
        }`,
      fragmentShader: source,
      uniforms: getUniforms() as Record<string, { value: unknown }>,
      glslVersion: THREE.GLSL3,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
    });
  }, [size.width, size.height, source]);

  return (
    <mesh ref={ref}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};

const Shader: React.FC<{ source: string; uniforms: Uniforms }> = ({ source, uniforms }) => (
  <Canvas className="absolute inset-0 h-full w-full">
    <ShaderMaterial source={source} uniforms={uniforms} />
  </Canvas>
);

export const SignInPage = ({ className }: SignInPageProps) => {
  const { pathname } = useLocation();
  const { login, register, accessToken } = useAuth();

  // If we're already logged in, skip the whole shebang.
  if (accessToken) return <Navigate to="/app" replace />;

  // /register defaults to sign-up mode; /login defaults to sign-in.
  const initialMode: "signin" | "signup" = pathname === "/register" ? "signup" : "signin";

  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [step, setStep] = useState<"form" | "success">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialCanvasVisible, setInitialCanvasVisible] = useState(true);
  const [reverseCanvasVisible, setReverseCanvasVisible] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await login(email.trim(), password);
      } else {
        await register(name.trim() || email.split("@")[0], email.trim(), password);
      }
      // Login worked. Play the reverse-reveal, then the Navigate below
      // (inside the effect below) kicks in because accessToken flips.
      setReverseCanvasVisible(true);
      setTimeout(() => setInitialCanvasVisible(false), 50);
      setTimeout(() => setStep("success"), 1500);
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "Something went wrong. Try again?";
      setError(message);
      setSubmitting(false);
    }
  }

  function fillDemo() {
    setMode("signin");
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <div className={cn("flex w-full flex-col min-h-screen bg-black relative", className)}>
      <div className="absolute inset-0 z-0">
        {initialCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={3}
              containerClassName="bg-black"
              colors={[[255, 255, 255], [255, 255, 255]]}
              dotSize={6}
              reverse={false}
            />
          </div>
        )}
        {reverseCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={4}
              containerClassName="bg-black"
              colors={[[255, 255, 255], [255, 255, 255]]}
              dotSize={6}
              reverse={true}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,1)_0%,_transparent_100%)]" />
        <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-black to-transparent" />
      </div>

      {/* Back to home */}
      <Link
        to="/"
        className="absolute top-5 left-5 z-20 text-xs text-white/50 hover:text-white/90 transition-colors inline-flex items-center gap-1.5"
      >
        ← Back to site
      </Link>

      <div className="relative z-10 flex flex-col flex-1">
        <div className="flex flex-1 flex-col lg:flex-row">
          <div className="flex-1 flex flex-col justify-center items-center">
            <div className="w-full mt-[120px] max-w-sm px-6">
              <AnimatePresence mode="wait">
                {step === "form" ? (
                  <motion.div
                    key="form-step"
                    initial={{ opacity: 0, x: -60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h1 className="text-[2.25rem] sm:text-[2.5rem] font-bold leading-[1.1] tracking-tight text-white">
                        {mode === "signin" ? "Welcome back" : "Create your account"}
                      </h1>
                      <p className="text-[1.2rem] sm:text-[1.35rem] text-white/70 font-light">
                        {mode === "signin"
                          ? "Sign in to your Beacon account"
                          : "Start tracking your portfolio today"}
                      </p>
                    </div>

                    {/* Mode toggle */}
                    <div className="inline-flex rounded-full border border-white/10 p-1 bg-white/5">
                      <button
                        type="button"
                        onClick={() => { setMode("signin"); setError(null); }}
                        className={cn(
                          "px-6 py-2 rounded-full text-sm transition-colors",
                          mode === "signin"
                            ? "bg-white text-black font-medium"
                            : "text-white/70 hover:text-white",
                        )}
                      >
                        Sign in
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMode("signup"); setError(null); }}
                        className={cn(
                          "px-6 py-2 rounded-full text-sm transition-colors",
                          mode === "signup"
                            ? "bg-white text-black font-medium"
                            : "text-white/70 hover:text-white",
                        )}
                      >
                        Sign up
                      </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                      {mode === "signup" && (
                        <input
                          type="text"
                          placeholder="Your name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full text-white placeholder:text-white/30 border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-white/40 bg-white/[0.03] text-[15px]"
                        />
                      )}
                      <input
                        ref={emailRef}
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                        className="w-full text-white placeholder:text-white/30 border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-white/40 bg-white/[0.03] text-[15px]"
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                        required
                        minLength={mode === "signup" ? 8 : undefined}
                        className="w-full text-white placeholder:text-white/30 border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-white/40 bg-white/[0.03] text-[15px]"
                      />

                      {error && (
                        <div className="text-[13px] text-red-300/90 bg-red-500/10 border border-red-400/20 rounded-full py-2 px-4">
                          {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-full bg-white text-black font-medium py-3 hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {submitting
                          ? (mode === "signin" ? "Signing in…" : "Creating account…")
                          : (mode === "signin" ? "Sign in" : "Create account")}
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={fillDemo}
                      className="w-full rounded-full border border-white/15 bg-white/[0.03] text-white/80 hover:text-white hover:bg-white/10 transition-colors py-2.5 text-sm"
                    >
                      Try the demo account
                    </button>

                    <p className="text-[10px] text-white/30 pt-2 leading-relaxed">
                      By continuing, you agree to Beacon's{" "}
                      <Link to="/terms" className="underline hover:text-white/60 transition-colors">Terms</Link>{" "}
                      and{" "}
                      <Link to="/privacy" className="underline hover:text-white/60 transition-colors">Privacy Notice</Link>.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="success-step"
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight text-white">You're in!</h1>
                      <p className="text-[1.25rem] text-white/50 font-light">Welcome to Beacon</p>
                    </div>
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.3 }}
                      className="py-10"
                    >
                      <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-white to-white/70 flex items-center justify-center">
                        <svg className="h-8 w-8 text-black" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </motion.div>
                    <Link to="/app" className="block w-full rounded-full bg-white text-black font-medium py-3 hover:bg-white/90 transition-colors">
                      Continue to Dashboard
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
