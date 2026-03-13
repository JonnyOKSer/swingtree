import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Ash particle that falls like snow
function AshParticle({ position, speed }: { position: [number, number, number]; speed: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const initialY = position[1]

  useFrame((state) => {
    if (!ref.current) return
    ref.current.position.y -= speed * 0.01
    ref.current.position.x += Math.sin(state.clock.elapsedTime + position[0]) * 0.001
    if (ref.current.position.y < -2) {
      ref.current.position.y = initialY + 4
    }
    ref.current.rotation.z += 0.002
  })

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.03, 8, 8]} />
      <meshBasicMaterial color="#3a3a3a" transparent opacity={0.6} />
    </mesh>
  )
}

// Cluster of ash particles forming a tennis ball shape
function TennisBallAsh({ position, speed }: { position: [number, number, number]; speed: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const initialY = position[1]

  const particles = useMemo(() => {
    const points: [number, number, number][] = []
    const radius = 0.15
    for (let i = 0; i < 20; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      points.push([
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      ])
    }
    return points
  }, [])

  useFrame((state) => {
    if (!groupRef.current) return
    groupRef.current.position.y -= speed * 0.008
    groupRef.current.position.x += Math.sin(state.clock.elapsedTime * 0.5 + position[0]) * 0.002
    if (groupRef.current.position.y < -3) {
      groupRef.current.position.y = initialY + 6
    }
    groupRef.current.rotation.y += 0.003
    groupRef.current.rotation.x += 0.001
  })

  return (
    <group ref={groupRef} position={position}>
      {particles.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.02, 6, 6]} />
          <meshBasicMaterial color="#4a4a4a" transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  )
}

// Lightning bolt with glow effect
function Lightning({ position, delay, scale }: { position: [number, number, number]; delay: number; scale: number }) {
  const boltRef = useRef<THREE.MeshBasicMaterial>(null)
  const glowRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    if (!boltRef.current || !glowRef.current) return
    const time = state.clock.elapsedTime
    const cycle = (time + delay) % 4

    let opacity = 0
    if (cycle < 0.05) {
      opacity = 1
    } else if (cycle < 0.1) {
      opacity = 0.2
    } else if (cycle < 0.15) {
      opacity = 0.9
    } else if (cycle < 0.2) {
      opacity = 0.4
    } else if (cycle < 0.25) {
      opacity = 0
    }

    boltRef.current.opacity = opacity
    glowRef.current.opacity = opacity * 0.4
  })

  const shape = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.lineTo(0.15, 0.4)
    s.lineTo(0.08, 0.4)
    s.lineTo(0.22, 0.8)
    s.lineTo(0.12, 0.8)
    s.lineTo(0.3, 1.3)
    s.lineTo(0.08, 0.7)
    s.lineTo(0.15, 0.7)
    s.lineTo(0.02, 0.35)
    s.lineTo(0.1, 0.35)
    s.closePath()
    return s
  }, [])

  return (
    <group position={position} scale={[scale, scale, 1]}>
      <mesh position={[0, 0, -0.1]} scale={[1.5, 1.5, 1]}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial ref={glowRef} color="#ffaa44" transparent opacity={0} />
      </mesh>
      <mesh>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial ref={boltRef} color="#ffffff" transparent opacity={0} />
      </mesh>
    </group>
  )
}

// Horizon glow that pulses with lightning
function HorizonGlow() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  useFrame((state) => {
    if (!materialRef.current) return
    const time = state.clock.elapsedTime
    const cycle1 = time % 4
    const cycle2 = (time + 2) % 4
    let flash = 0
    if (cycle1 < 0.25 || cycle2 < 0.25) {
      flash = 0.3
    }
    materialRef.current.uniforms.uFlash.value = flash
  })

  return (
    <mesh position={[0, -1.2, -9]}>
      <planeGeometry args={[50, 1.5]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        uniforms={{
          uFlash: { value: 0 }
        }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uFlash;
          varying vec2 vUv;
          void main() {
            float glow = smoothstep(0.0, 1.0, 1.0 - vUv.y);
            vec3 color = vec3(1.0, 0.6, 0.2) * glow * (0.15 + uFlash);
            gl_FragColor = vec4(color, glow * 0.5);
          }
        `}
      />
    </mesh>
  )
}

// Twinkling stars
function Stars() {
  const starsRef = useRef<THREE.Points>(null)

  const [positions, phases] = useMemo(() => {
    const pos: number[] = []
    const ph: number[] = []
    for (let i = 0; i < 200; i++) {
      pos.push(
        (Math.random() - 0.5) * 40,
        Math.random() * 8 + 1,
        -9.5
      )
      ph.push(Math.random() * Math.PI * 2)
    }
    return [new Float32Array(pos), ph]
  }, [])

  const sizes = useMemo(() => {
    const s: number[] = []
    for (let i = 0; i < 200; i++) {
      s.push(Math.random() * 2 + 0.5)
    }
    return new Float32Array(s)
  }, [])

  useFrame((state) => {
    if (!starsRef.current) return
    const colors = starsRef.current.geometry.attributes.color
    if (!colors) return

    const time = state.clock.elapsedTime
    for (let i = 0; i < 200; i++) {
      const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 0.5 + phases[i]))
      colors.setXYZ(i, twinkle, twinkle, twinkle * 0.95)
    }
    colors.needsUpdate = true
  })

  const colors = useMemo(() => {
    const c = new Float32Array(200 * 3)
    for (let i = 0; i < 200; i++) {
      c[i * 3] = 1
      c[i * 3 + 1] = 1
      c[i * 3 + 2] = 0.95
    }
    return c
  }, [])

  return (
    <points ref={starsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  )
}

// Glowing tennis ball ember on the ground
function GlowingTennisBall({ position, phase, size }: {
  position: [number, number, number]
  phase: number
  size: number
}) {
  const coreRef = useRef<THREE.MeshBasicMaterial>(null)
  const glowRef = useRef<THREE.MeshBasicMaterial>(null)
  const outerGlowRef = useRef<THREE.MeshBasicMaterial>(null)
  const seamRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    // Gentle pulsing at different rates
    const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * (0.4 + phase * 0.1) + phase))
    if (coreRef.current) {
      coreRef.current.opacity = pulse * 0.95
    }
    if (glowRef.current) {
      glowRef.current.opacity = pulse * 0.35
    }
    if (outerGlowRef.current) {
      outerGlowRef.current.opacity = pulse * 0.15
    }
    if (seamRef.current) {
      seamRef.current.opacity = pulse * 0.25
    }
  })

  // Single subtle seam curve
  const seamCurve = useMemo(() => {
    const points: THREE.Vector3[] = []
    const segments = 32
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2
      const r = size * 1.01
      const x = Math.cos(t) * r
      const y = Math.sin(t * 2) * r * 0.25
      const z = Math.sin(t) * r
      points.push(new THREE.Vector3(x, y, z))
    }
    return new THREE.CatmullRomCurve3(points, true)
  }, [size])

  const seamGeometry = useMemo(() => {
    return new THREE.TubeGeometry(seamCurve, 32, size * 0.02, 4, true)
  }, [seamCurve, size])

  return (
    <group position={position}>
      {/* Outer ambient glow - largest, most diffuse */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -size * 0.8, 0]}>
        <circleGeometry args={[size * 4, 16]} />
        <meshBasicMaterial
          ref={outerGlowRef}
          color="#c8d96f"
          transparent
          opacity={0.12}
        />
      </mesh>

      {/* Inner glow halo */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -size * 0.7, 0]}>
        <circleGeometry args={[size * 2, 16]} />
        <meshBasicMaterial
          ref={glowRef}
          color="#d4e07a"
          transparent
          opacity={0.3}
        />
      </mesh>

      {/* Glowing ball core - the main ember */}
      <mesh>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial
          ref={coreRef}
          color="#c8d96f"
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Barely visible seam - just a hint */}
      <mesh geometry={seamGeometry}>
        <meshBasicMaterial
          ref={seamRef}
          color="#a0b050"
          transparent
          opacity={0.2}
        />
      </mesh>
    </group>
  )
}

// Acacia/umbrella tree silhouette
function AcaciaTree() {
  return (
    <group position={[0, -1.5, -5]}>
      <mesh position={[0, 0.6, 0]} rotation={[0, 0, 0.03]}>
        <cylinderGeometry args={[0.06, 0.1, 1.4, 8]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>

      <mesh position={[-0.3, 1.2, 0]} rotation={[0, 0, 0.8]}>
        <cylinderGeometry args={[0.03, 0.05, 0.8, 6]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      <mesh position={[0.35, 1.15, 0]} rotation={[0, 0, -0.7]}>
        <cylinderGeometry args={[0.03, 0.05, 0.9, 6]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      <mesh position={[0.1, 1.3, 0]} rotation={[0, 0, -0.2]}>
        <cylinderGeometry args={[0.02, 0.04, 0.5, 6]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      <mesh position={[-0.15, 1.25, 0]} rotation={[0, 0, 0.3]}>
        <cylinderGeometry args={[0.02, 0.04, 0.4, 6]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>

      <mesh position={[0, 1.7, 0]} scale={[1, 0.25, 0.8]}>
        <sphereGeometry args={[1.2, 24, 12]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      <mesh position={[-0.3, 1.65, 0]} scale={[1, 0.2, 0.7]}>
        <sphereGeometry args={[0.7, 16, 8]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      <mesh position={[0.4, 1.68, 0]} scale={[1, 0.22, 0.7]}>
        <sphereGeometry args={[0.6, 16, 8]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      <mesh position={[0, 1.75, 0]} scale={[1, 0.18, 0.6]}>
        <sphereGeometry args={[0.9, 16, 8]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>

      <mesh position={[-1.0, 1.6, 0]} scale={[0.8, 0.15, 0.5]}>
        <sphereGeometry args={[0.4, 12, 6]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
      <mesh position={[1.1, 1.62, 0]} scale={[0.8, 0.15, 0.5]}>
        <sphereGeometry args={[0.35, 12, 6]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
    </group>
  )
}

// Ground - larger to ensure full coverage
function Ground() {
  return (
    <mesh position={[0, -1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[60, 40]} />
      <meshBasicMaterial color="#0d0a08" />
    </mesh>
  )
}

// Main scene
function Scene() {
  const tennisBalls = useMemo(() => {
    return Array.from({ length: 15 }, () => ({
      position: [
        (Math.random() - 0.5) * 8,
        Math.random() * 6 + 2,
        (Math.random() - 0.5) * 4 - 2
      ] as [number, number, number],
      speed: Math.random() * 0.5 + 0.3
    }))
  }, [])

  const ashParticles = useMemo(() => {
    return Array.from({ length: 40 }, () => ({
      position: [
        (Math.random() - 0.5) * 10,
        Math.random() * 8,
        (Math.random() - 0.5) * 6 - 1
      ] as [number, number, number],
      speed: Math.random() * 0.3 + 0.2
    }))
  }, [])

  // Glowing tennis ball embers - scattered across foreground like accent lighting
  const landedBalls = useMemo(() => {
    return Array.from({ length: 16 }, () => ({
      position: [
        (Math.random() - 0.5) * 12,
        -1.47,
        Math.random() * 3 - 0.5
      ] as [number, number, number],
      phase: Math.random() * Math.PI * 2,
      size: Math.random() * 0.015 + 0.018
    }))
  }, [])

  return (
    <>
      {/* Serengeti gradient sky - larger for full coverage */}
      <mesh position={[0, 0, -10]}>
        <planeGeometry args={[60, 30]} />
        <shaderMaterial
          vertexShader={`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            varying vec2 vUv;
            void main() {
              vec3 nightColor = vec3(0.02, 0.02, 0.05);
              vec3 duskColor = vec3(0.1, 0.06, 0.12);
              vec3 amberColor = vec3(0.5, 0.25, 0.1);
              vec3 horizonColor = vec3(0.9, 0.45, 0.1);
              vec3 glowColor = vec3(0.95, 0.35, 0.05);

              float t = vUv.y;
              vec3 color;

              if (t < 0.06) {
                color = mix(glowColor, horizonColor, t / 0.06);
              } else if (t < 0.14) {
                color = mix(horizonColor, amberColor, (t - 0.06) / 0.08);
              } else if (t < 0.28) {
                color = mix(amberColor, duskColor, (t - 0.14) / 0.14);
              } else {
                color = mix(duskColor, nightColor, (t - 0.28) / 0.72);
              }

              gl_FragColor = vec4(color, 1.0);
            }
          `}
        />
      </mesh>

      <Stars />
      <Ground />
      <HorizonGlow />
      <AcaciaTree />

      {/* Glowing tennis ball embers on ground */}
      {landedBalls.map((ball, i) => (
        <GlowingTennisBall
          key={`ember-${i}`}
          position={ball.position}
          phase={ball.phase}
          size={ball.size}
        />
      ))}

      <Lightning position={[-4, -0.5, -8]} delay={0} scale={0.7} />
      <Lightning position={[5, -0.4, -8.5]} delay={2} scale={0.5} />

      {tennisBalls.map((ball, i) => (
        <TennisBallAsh key={`ball-${i}`} position={ball.position} speed={ball.speed} />
      ))}

      {ashParticles.map((ash, i) => (
        <AshParticle key={`ash-${i}`} position={ash.position} speed={ash.speed} />
      ))}
    </>
  )
}

export default function SerengetiScene() {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#0d0a08' }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        style={{ display: 'block' }}
        gl={{ antialias: true }}
      >
        <Scene />
      </Canvas>
    </div>
  )
}
