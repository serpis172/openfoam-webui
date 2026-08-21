import { useEffect } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'

const API_KEY = import.meta.env.VITE_API_KEY as string | undefined

interface GLTFModelProps {
  url: string
  wireframe?: boolean
  color?: string
}

export function GLTFModel({ url, wireframe = false, color = '#34d399' }: GLTFModelProps) {
  const gltf = useLoader(GLTFLoader, url, loader => {
    if (API_KEY) loader.setRequestHeader({ 'X-API-Key': API_KEY })
  })
  const { camera, controls } = useThree() as any

  useEffect(() => {
    gltf.scene.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshStandardMaterial({
          color,
          wireframe,
          side: THREE.DoubleSide,
        })
      }
    })
  }, [gltf, wireframe, color])

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const size = box.getSize(new THREE.Vector3()).length() || 1
    const center = box.getCenter(new THREE.Vector3())
    if (camera) {
      camera.position.copy(center.clone().add(new THREE.Vector3(1, 1, 1).multiplyScalar(size * 0.6)))
      camera.lookAt(center)
      if (controls) {
        controls.target.copy(center)
        controls.update()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf])

  return <primitive object={gltf.scene} />
}
