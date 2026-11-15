import * as THREE from 'three';
import { measureScanDepth } from './registration.js';

export const organStructureNames = new Set([
  'Heart', 'Lung_L', 'Lung_R', 'Liver', 'Gallbladder', 'Stomach', 'Pancreas', 'Spleen',
  'Kidney_L', 'Kidney_R', 'Adrenal_L', 'Adrenal_R', 'Bladder', 'Small_Intestine',
  'Large_Intestine', 'Trachea', 'Bronchi', 'Esophagus',
]);

const organMaterials = {
  Heart: [0x9f283c, 0.29],
  Lung_L: [0xd1747c, 0.4],
  Lung_R: [0xd1747c, 0.4],
  Liver: [0x743021, 0.42],
  Gallbladder: [0x798036, 0.43],
  Stomach: [0xc77463, 0.38],
  Pancreas: [0xc69b6b, 0.43],
  Spleen: [0x80364b, 0.42],
  Kidney_L: [0x8c3740, 0.37],
  Kidney_R: [0x8c3740, 0.37],
  Adrenal_L: [0xa45b39, 0.44],
  Adrenal_R: [0xa45b39, 0.44],
  Bladder: [0xb9685e, 0.39],
  Small_Intestine: [0xd58b79, 0.4],
  Large_Intestine: [0xb66e63, 0.42],
  Trachea: [0xd69a86, 0.4],
  Bronchi: [0xd18d7d, 0.4],
  Esophagus: [0xc57a69, 0.42],
};

function boneBounds(root, matrix, name) {
  const bone = root.getObjectByName(name);
  if (!bone) throw new Error(`Missing bone landmark for organ placement: ${name}`);
  return new THREE.Box3().setFromObject(bone).applyMatrix4(matrix);
}

function unionBounds(root, matrix, names) {
  const bounds = new THREE.Box3();
  for (const name of names) bounds.union(boneBounds(root, matrix, name));
  return bounds;
}

function sizeOf(bounds) {
  return bounds.getSize(new THREE.Vector3());
}

function centerOf(bounds) {
  return bounds.getCenter(new THREE.Vector3());
}

function finiteSize(width, height, depth) {
  return new THREE.Vector3(
    Math.max(0.025, width),
    Math.max(0.025, height),
    Math.max(0.025, depth),
  );
}

function scaleToPlacement(sourceSize, targetSize) {
  const scale = new THREE.Vector3();
  for (const axis of ['x', 'y', 'z']) {
    const source = sourceSize[axis];
    const target = targetSize[axis];
    if (!Number.isFinite(source) || source <= 0 || !Number.isFinite(target) || target <= 0) {
      throw new Error('An organ or its measured placement volume has invalid dimensions.');
    }
    scale[axis] = (target / source) * 0.96;
  }
  return scale;
}

function createPlacements(referenceRoot, registration, scanDepthProfile) {
  const matrix = registration.matrix;
  const leftRibs = unionBounds(referenceRoot, matrix, ['Rib_2_L', 'Rib_3_L', 'Rib_4_L', 'Rib_5_L', 'Rib_6_L', 'Rib_7_L']);
  const rightRibs = unionBounds(referenceRoot, matrix, ['Rib_2_R', 'Rib_3_R', 'Rib_4_R', 'Rib_5_R', 'Rib_6_R', 'Rib_7_R']);
  const ribCage = leftRibs.clone().union(rightRibs);
  const ribSize = sizeOf(ribCage);
  const ribCenter = centerOf(ribCage);
  const sternum = boneBounds(referenceRoot, matrix, 'Sternum');
  const pelvis = boneBounds(referenceRoot, matrix, 'Pelvis_Center');
  const clavicles = unionBounds(referenceRoot, matrix, ['Clavicle_L', 'Clavicle_R']);
  const rib7 = boneBounds(referenceRoot, matrix, 'Rib_7_R');
  const vertebra10 = boneBounds(referenceRoot, matrix, 'Vertebra_10');
  const midlineX = centerOf(sternum).x;
  const leftOuterX = leftRibs.min.x;
  const rightOuterX = rightRibs.max.x;
  const leftWidth = midlineX - leftOuterX;
  const rightWidth = rightOuterX - midlineX;
  const thoraxDepthProfile = measureScanDepth(scanDepthProfile, ribCenter.y);
  const abdomenY = THREE.MathUtils.lerp(pelvis.max.y, rib7.getCenter(new THREE.Vector3()).y, 0.55);
  const abdomenDepthProfile = measureScanDepth(scanDepthProfile, abdomenY);
  const pelvisDepthProfile = measureScanDepth(scanDepthProfile, centerOf(pelvis).y);
  const thoraxCavityDepth = thoraxDepthProfile.depth * 0.66;
  const thoraxCenterZ = THREE.MathUtils.lerp(thoraxDepthProfile.frontZ, thoraxDepthProfile.backZ, 0.55);
  const abdomenDepth = abdomenDepthProfile.depth * 0.64;
  const abdomenFrontZ = abdomenDepthProfile.frontZ + abdomenDepthProfile.depth * 0.24;
  const abdomenCenterZ = THREE.MathUtils.lerp(
    abdomenDepthProfile.frontZ,
    abdomenDepthProfile.backZ,
    0.58,
  );
  const pelvisDepth = pelvisDepthProfile.depth * 0.58;
  const pelvisFrontZ = pelvisDepthProfile.frontZ + pelvisDepthProfile.depth * 0.35;
  const kidneyY = THREE.MathUtils.lerp(vertebra10.getCenter(new THREE.Vector3()).y, pelvis.max.y, 0.48);
  const kidneyDepthProfile = measureScanDepth(scanDepthProfile, kidneyY);
  const kidneyCenterZ = kidneyDepthProfile.frontZ + kidneyDepthProfile.depth * 0.82;
  const upperAbdomenY = abdomenY;
  const abdomenSpan = Math.max(rib7.getCenter(new THREE.Vector3()).y - pelvis.max.y, sizeOf(pelvis).y);
  const thorax = {
    width: ribSize.x,
    height: ribSize.y,
    depth: thoraxCavityDepth,
    centerZ: thoraxCenterZ,
  };
  const leftCenterX = (midlineX + leftOuterX) * 0.5;
  const rightCenterX = (midlineX + rightOuterX) * 0.5;
  const liverCenter = new THREE.Vector3(
    THREE.MathUtils.lerp(midlineX, rightOuterX, 0.58),
    upperAbdomenY + abdomenSpan * 0.07,
    abdomenFrontZ + abdomenDepth * 0.46,
  );
  const stomachCenter = new THREE.Vector3(
    THREE.MathUtils.lerp(midlineX, leftOuterX, 0.62),
    upperAbdomenY,
    abdomenFrontZ + abdomenDepth * 0.43,
  );
  const kidneySize = finiteSize(leftWidth * 0.48, ribSize.y * 0.34, kidneyDepthProfile.depth * 0.32);
  const kidneyLeftCenter = new THREE.Vector3(
    THREE.MathUtils.lerp(midlineX, leftOuterX, 0.5),
    kidneyY,
    kidneyCenterZ,
  );
  const kidneyRightCenter = new THREE.Vector3(
    THREE.MathUtils.lerp(midlineX, rightOuterX, 0.5),
    kidneyY,
    kidneyCenterZ,
  );
  const placements = new Map();
  const place = (name, center, size) => placements.set(name, { center, size: finiteSize(size.x, size.y, size.z) });

  place('Lung_L', new THREE.Vector3(leftCenterX, ribCenter.y, thorax.centerZ),
    finiteSize(leftWidth * 0.78, thorax.height * 0.86, thorax.depth * 0.78));
  place('Lung_R', new THREE.Vector3(rightCenterX, ribCenter.y, thorax.centerZ),
    finiteSize(rightWidth * 0.78, thorax.height * 0.86, thorax.depth * 0.78));
  place('Heart', new THREE.Vector3(midlineX - ribSize.x * 0.045, ribCenter.y - ribSize.y * 0.08, thorax.centerZ),
    finiteSize(ribSize.x * 0.42, ribSize.y * 0.58, thorax.depth * 0.72));
  place('Liver', liverCenter, finiteSize(rightWidth * 0.9, ribSize.y * 0.47, abdomenDepth * 0.66));
  place('Stomach', stomachCenter, finiteSize(leftWidth * 0.78, ribSize.y * 0.42, abdomenDepth * 0.62));
  place('Gallbladder', new THREE.Vector3(
    liverCenter.x - rightWidth * 0.17,
    liverCenter.y - abdomenSpan * 0.24,
    liverCenter.z - abdomenDepth * 0.11,
  ), finiteSize(rightWidth * 0.19, abdomenSpan * 0.36, abdomenDepth * 0.2));
  place('Pancreas', new THREE.Vector3(midlineX, abdomenY - abdomenSpan * 0.08, abdomenCenterZ + abdomenDepth * 0.07),
    finiteSize(ribSize.x * 0.62, abdomenSpan * 0.26, abdomenDepth * 0.34));
  place('Spleen', new THREE.Vector3(
    THREE.MathUtils.lerp(midlineX, leftOuterX, 0.76),
    upperAbdomenY + abdomenSpan * 0.05,
    abdomenCenterZ + abdomenDepth * 0.06,
  ), finiteSize(leftWidth * 0.42, abdomenSpan * 0.43, abdomenDepth * 0.38));
  place('Kidney_L', kidneyLeftCenter, kidneySize);
  place('Kidney_R', kidneyRightCenter, kidneySize);
  place('Adrenal_L', new THREE.Vector3(kidneyLeftCenter.x, kidneyLeftCenter.y + abdomenSpan * 0.29, kidneyLeftCenter.z - abdomenDepth * 0.08),
    finiteSize(leftWidth * 0.22, abdomenSpan * 0.16, abdomenDepth * 0.2));
  place('Adrenal_R', new THREE.Vector3(kidneyRightCenter.x, kidneyRightCenter.y + abdomenSpan * 0.29, kidneyRightCenter.z - abdomenDepth * 0.08),
    finiteSize(rightWidth * 0.22, abdomenSpan * 0.16, abdomenDepth * 0.2));
  place('Bladder', new THREE.Vector3(centerOf(pelvis).x, centerOf(pelvis).y, pelvisFrontZ),
    finiteSize(sizeOf(pelvis).x * 0.48, sizeOf(pelvis).y * 0.62, pelvisDepth * 0.55));
  place('Small_Intestine', new THREE.Vector3(midlineX, abdomenY - abdomenSpan * 0.12, abdomenCenterZ),
    finiteSize(ribSize.x * 0.76, abdomenSpan * 0.72, abdomenDepth * 0.68));
  place('Large_Intestine', new THREE.Vector3(midlineX, abdomenY - abdomenSpan * 0.08, abdomenCenterZ),
    finiteSize(ribSize.x * 0.91, abdomenSpan * 0.82, abdomenDepth * 0.62));
  place('Trachea', new THREE.Vector3(midlineX, (clavicles.max.y + sternum.max.y) * 0.5, thorax.centerZ),
    finiteSize(ribSize.x * 0.17, (clavicles.max.y - sternum.max.y) * 0.9, thorax.depth * 0.24));
  place('Bronchi', new THREE.Vector3(midlineX, ribCenter.y + ribSize.y * 0.1, thorax.centerZ),
    finiteSize(ribSize.x * 0.58, ribSize.y * 0.32, thorax.depth * 0.5));
  place('Esophagus', new THREE.Vector3(midlineX, ribCenter.y - ribSize.y * 0.1, thoraxCenterZ + thorax.depth * 0.28),
    finiteSize(ribSize.x * 0.15, ribSize.y * 0.84, thorax.depth * 0.2));

  return placements;
}

export function placeOrganStructures(gltf, referenceRoot, registration) {
  if (!registration?.matrix || !registration?.scanDepthProfile) {
    throw new Error('Missing landmark registration data for organ placement.');
  }
  const placements = createPlacements(referenceRoot, registration, registration.scanDepthProfile);
  const placed = [];
  for (const root of gltf.scene.children) {
    if (!organStructureNames.has(root.name)) continue;
    const placement = placements.get(root.name);
    if (!placement) throw new Error(`No measured bone landmark placement is defined for ${root.name}.`);
    root.updateMatrixWorld(true);
    const sourceBounds = new THREE.Box3().setFromObject(root);
    const sourceSize = sizeOf(sourceBounds);
    root.position.copy(placement.center);
    root.scale.copy(scaleToPlacement(sourceSize, placement.size));
    root.updateMatrix();
    root.updateMatrixWorld(true);

    const [color, roughness] = organMaterials[root.name];
    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0.01,
      clearcoat: 0.2,
      clearcoatRoughness: 0.34,
    });
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
      object.userData.structureKey = root.name;
    });
    root.userData.structureKey = root.name;
    root.userData.landmarkRegistered = true;
    placed.push(root.name);
  }

  const missing = [...organStructureNames].filter((name) => !placed.includes(name));
  if (missing.length) throw new Error(`The GLB is missing named organ structures: ${missing.join(', ')}.`);
  return { placed, placements };
}
