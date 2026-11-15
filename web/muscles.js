import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const structureKeys = [
  'Neck_L', 'Neck_R', 'Pectorals_L', 'Pectorals_R', 'Deltoids_L', 'Deltoids_R',
  'Biceps_L', 'Biceps_R', 'Triceps_L', 'Triceps_R', 'Forearm_L', 'Forearm_R',
  'Abdominals_L', 'Abdominals_R', 'Obliques_L', 'Obliques_R', 'Trapezius_L',
  'Trapezius_R', 'Latissimus_L', 'Latissimus_R', 'Glutes_L', 'Glutes_R',
  'Quadriceps_L', 'Quadriceps_R', 'Hamstrings_L', 'Hamstrings_R', 'Calves_L', 'Calves_R',
];

export const muscleStructureNames = new Set(structureKeys);

let loadPromise;

export function loadMuscleStructures() {
  if (loadPromise) return loadPromise;

  const draco = new DRACOLoader();
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loadPromise = loader.loadAsync('/assets/anatomy/muscles.glb')
    .then((gltf) => {
      const roots = gltf.scene.children.filter((root) => muscleStructureNames.has(root.name));
      const missing = [...muscleStructureNames].filter((name) => !roots.some((root) => root.name === name));
      if (missing.length) {
        throw new Error(`The muscle GLB is missing named structures: ${missing.join(', ')}.`);
      }

      const material = new THREE.MeshPhysicalMaterial({
        color: 0x71372f,
        roughness: 0.54,
        metalness: 0.01,
        clearcoat: 0.14,
        clearcoatRoughness: 0.4,
      });
      for (const root of roots) {
        root.traverse((object) => {
          if (!object.isMesh) return;
          object.material = material;
          object.castShadow = true;
          object.receiveShadow = true;
          object.userData.structureKey = root.name;
        });
        root.userData.structureKey = root.name;
        root.userData.landmarkRegistered = true;
      }
      return roots;
    })
    .catch((error) => {
      loadPromise = undefined;
      throw error;
    })
    .finally(() => draco.dispose());

  return loadPromise;
}
