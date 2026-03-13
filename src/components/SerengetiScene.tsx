import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Ash particle that falls like snow
function AshParticle({ position, speed }: { position: [number, number, number]; speed: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const initialY = position[1]

  useFrame((state) => {
    if (!ref.current) return
    // Fall slowly
    ref.current.position.y -= speed * 0.01
    // Gentle sway
    ref.current.position.x += Math.sin(state.clock.elapsedTime + position[0]) * 0.001
    // Reset when below ground
    if (ref.current.position.y < -2) {
      ref.current.position.y = initialY + 4
    }
    // Slow rotation
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

  // Generate points on a sphere surface to form tennis ball shape
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
    // Fall slowly
    groupRef.current.position.y -= speed * 0.008
    // Gentle sway
    groupRef.current.position.x += Math.sin(state.clock.elapsedTime * 0.5 + position[0]) * 0.002
    // Reset when below ground
    if (groupRef.current.position.y < -3) {
      groupRef.current.position.y = initialY + 6
    }
    // Slow rotation
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

// Lightning bolt that flashes on the horizon
function Lightning() {
  const ref = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    if (!materialRef.current) return
    // Flash every 3 seconds with some randomness
    const time = state.clock.elapsedTime
    const cycle = time % 3.5

    if (cycle < 0.1) {
      materialRef.current.opacity = 0.9
    } else if (cycle < 0.15) {
      materialRef.current.opacity = 0.3
    } else if (cycle < 0.2) {
      materialRef.current.opacity = 0.7
    } else if (cycle < 0.25) {
      materialRef.current.opacity = 0
    } else {
      materialRef.current.opacity = 0
    }
  })

  // Create lightning bolt shape
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.lineTo(0.1, 0.3)
    s.lineTo(0.05, 0.3)
    s.lineTo(0.15, 0.6)
    s.lineTo(0.08, 0.6)
    s.lineTo(0.2, 1)
    s.lineTo(0.05, 0.5)
    s.lineTo(0.1, 0.5)
    s.lineTo(-0.02, 0.2)
    s.lineTo(0.05, 0.2)
    s.closePath()
    return s
  }, [])

  return (
    <mesh ref={ref} position={[-3, -0.3, -8]} scale={[0.8, 0.8, 1]}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial ref={materialRef} color="#ffffff" transparent opacity={0} />
    </mesh>
  )
}

// Second lightning at different position
function Lightning2() {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    if (!materialRef.current) return
    const time = state.clock.elapsedTime
    // Offset by 1.5 seconds from first lightning
    const cycle = (time + 1.5) % 4

    if (cycle < 0.08) {
      materialRef.current.opacity = 0.7
    } else if (cycle < 0.12) {
      materialRef.current.opacity = 0.2
    } else if (cycle < 0.18) {
      materialRef.current.opacity = 0.5
    } else {
      materialRef.current.opacity = 0
    }
  })

  const shape = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.lineTo(0.08, 0.25)
    s.lineTo(0.03, 0.25)
    s.lineTo(0.12, 0.5)
    s.lineTo(0.06, 0.5)
    s.lineTo(0.15, 0.8)
    s.lineTo(0.03, 0.4)
    s.lineTo(0.08, 0.4)
    s.lineTo(-0.02, 0.15)
    s.lineTo(0.04, 0.15)
    s.closePath()
    return s
  }, [])

  return (
    <mesh position={[4, -0.2, -9]} scale={[0.6, 0.6, 1]}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial ref={materialRef} color="#ffffee" transparent opacity={0} />
    </mesh>
  )
}

// Simple ash tree silhouette
function AshTree() {
  return (
    <group position={[0, -1.5, -5]}>
      {/* Trunk */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.15, 1.6, 0.1]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
      {/* Main canopy - layered for depth */}
      <mesh position={[0, 2, 0]}>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.4, 1.7, 0]}>
        <sphereGeometry args={[0.5, 12, 12]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.5, 1.8, 0]}>
        <sphereGeometry args={[0.45, 12, 12]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 2.4, 0]}>
        <sphereGeometry args={[0.4, 12, 12]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
      {/* Branches */}
      <mesh position={[-0.3, 1.2, 0]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.05, 0.5, 0.03]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.35, 1.3, 0]} rotation={[0, 0, -0.4]}>
        <boxGeometry args={[0.05, 0.4, 0.03]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
    </group>
  )
}

// Ground/horizon
function Ground() {
  return (
    <mesh position={[0, -1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[30, 20]} />
      <meshBasicMaterial color="#2a2520" />
    </mesh>
  )
}

// Main scene
function Scene() {
  // Generate tennis ball ash particles
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

  // Generate scattered ash particles
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

  return (
    <>
      {/* Serengeti gradient sky */}
      <mesh position={[0, 0, -10]}>
        <planeGeometry args={[30, 15]} />
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
              // Serengeti dusk: deep charcoal at top, warm gold at horizon
              vec3 topColor = vec3(0.08, 0.08, 0.1);
              vec3 midColor = vec3(0.25, 0.15, 0.1);
              vec3 horizonColor = vec3(0.77, 0.59, 0.23);

              float t = vUv.y;
              vec3 color;
              if (t < 0.3) {
                color = mix(horizonColor, midColor, t / 0.3);
              } else {
                color = mix(midColor, topColor, (t - 0.3) / 0.7);
              }
              gl_FragColor = vec4(color, 1.0);
            }
          `}
        />
      </mesh>

      <Ground />
      <AshTree />
      <Lightning />
      <Lightning2 />

      {/* Tennis ball shaped ash clusters */}
      {tennisBalls.map((ball, i) => (
        <TennisBallAsh key={`ball-${i}`} position={ball.position} speed={ball.speed} />
      ))}

      {/* Scattered ash particles */}
      {ashParticles.map((ash, i) => (
        <AshParticle key={`ash-${i}`} position={ash.position} speed={ash.speed} />
      ))}
    </>
  )
}

export default function SerengetiScene() {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
        <Scene />
      </Canvas>
    </div>
  )
}
