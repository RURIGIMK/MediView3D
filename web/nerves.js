import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const structureKeys = [
  'Brain', 'Spinal_Cord', 'Cranial_Nerves', 'Brachial_Plexus_L',
  'Brachial_Plexus_R', 'Lumbar_Plexus_L', 'Lumbar_Plexus_R',
  'Sacral_Plexus_L', 'Sacral_Plexus_R', 'Sciatic_Nerve_L', 'Sciatic_Nerve_R',
];

export const nerveStructureNames = new Set(structureKeys);

let loadPromise;

export function loadNerveStructures() {
  if (loadPromise) return loadPromise;

  const draco = new DRACOLoader();
  draco.setDecoderPath('/web/vendor/three/examples/jsm/libs/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loadPromise = loader.loadAsync('/assets/anatomy/nerves.glb')
    .then((gltf) => {
      const roots = gltf.scene.children.filter((root) => nerveStructureNames.has(root.name));
      const missing = [...nerveStructureNames].filter((name) => !roots.some((root) => root.name === name));
      if (missing.length) {
        throw new Error(`The nerve GLB is missing named structures: ${missing.join(', ')}.`);
      }

      const material = new THREE.MeshPhysicalMaterial({
        color: 0xd4bd67,
        roughness: 0.48,
        metalness: 0,
        clearcoat: 0.16,
        clearcoatRoughness: 0.38,
        emissive: 0x594719,
        emissiveIntensity: 0.12,
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
