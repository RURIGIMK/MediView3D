import * as THREE from 'three';

export const vesselStructureNames = new Set([
  'Aorta_Central',
  'VenaCava_Central',
  'Carotid_L',
  'Carotid_R',
  'Artery_Arm_L',
  'Artery_Arm_R',
  'Vein_Arm_L',
  'Vein_Arm_R',
  'Artery_Leg_L',
  'Artery_Leg_R',
  'Vein_Leg_L',
  'Vein_Leg_R',
]);

function boxFor(root, name) {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Missing vessel landmark: ${name}`);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) throw new Error(`Empty vessel landmark: ${name}`);
  return bounds;
}

function collectScanProfiles(root) {
  if (!root) throw new Error('Missing skeleton scan for vessel landmark sampling.');
  root.updateMatrixWorld(true);
  const meshes = [];
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error('Skeleton scan has no bounds for vessel landmark sampling.');
  const binSize = 0.005;
  const binCount = Math.ceil(bounds.getSize(new THREE.Vector3()).y / binSize) + 1;
  const cellsPerBin = 4;
  const cellCount = binCount * cellsPerBin;
  const minX = new Float32Array(cellCount).fill(Infinity);
  const maxX = new Float32Array(cellCount).fill(-Infinity);
  const frontZ = new Float32Array(cellCount).fill(Infinity);
  const counts = new Uint32Array(cellCount);
  root.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry.getAttribute('position');
    if (!position) return;
    meshes.push({ object, position });
  });
  for (const { object, position } of meshes) {
    const matrix = object.matrixWorld.elements;
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index);
      const y = position.getY(index);
      const z = position.getZ(index);
      const worldX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
      const worldY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
      const worldZ = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
      const bin = THREE.MathUtils.clamp(Math.floor((worldY - bounds.min.y) / binSize), 0, binCount - 1);
      const side = worldX < 0 ? 0 : 1;
      const lateral = Math.abs(worldX);
      for (let threshold = 0; threshold < 2; threshold++) {
        if (lateral < (threshold === 0 ? 0.05 : 0.025)) continue;
        const cell = bin * cellsPerBin + threshold * 2 + side;
        minX[cell] = Math.min(minX[cell], worldX);
        maxX[cell] = Math.max(maxX[cell], worldX);
        frontZ[cell] = Math.min(frontZ[cell], worldZ);
        counts[cell]++;
      }
    }
  }
  return { minY: bounds.min.y, binSize, binCount, cellsPerBin, minX, maxX, frontZ, counts };
}

function sourceYAt(root, name, fraction) {
  const bounds = boxFor(root, name);
  return THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, fraction);
}

function scanLimbPoint(profiles, registrationRoot, side, sourceY, minimumLateral = 0.05) {
  const sideSign = side === 'L' ? -1 : 1;
  const targetY = registrationRoot.localToWorld(new THREE.Vector3(0, sourceY, 0)).y;
  const band = 0.015;
  let minX = Infinity;
  let maxX = -Infinity;
  let frontZ = Infinity;
  let count = 0;
  const threshold = minimumLateral >= 0.04 ? 0 : 1;
  const sideIndex = sideSign < 0 ? 0 : 1;
  const firstBin = Math.max(0, Math.floor((targetY - band - profiles.minY) / profiles.binSize));
  const lastBin = Math.min(profiles.binCount - 1, Math.floor((targetY + band - profiles.minY) / profiles.binSize));
  for (let bin = firstBin; bin <= lastBin; bin++) {
    const cell = bin * profiles.cellsPerBin + threshold * 2 + sideIndex;
    minX = Math.min(minX, profiles.minX[cell]);
    maxX = Math.max(maxX, profiles.maxX[cell]);
    frontZ = Math.min(frontZ, profiles.frontZ[cell]);
    count += profiles.counts[cell];
  }
  if (count < 100) {
    throw new Error(`Insufficient ${side} skeleton surface vertices near y=${targetY.toFixed(3)} for vessel placement.`);
  }
  const worldPoint = new THREE.Vector3((minX + maxX) * 0.5, targetY, frontZ - 0.008);
  return registrationRoot.worldToLocal(worldPoint);
}

function pointOnBone(root, name, xFraction, yFraction, zFraction = 0, offset = [0, 0, 0]) {
  const bounds = boxFor(root, name);
  const size = bounds.getSize(new THREE.Vector3());
  const point = bounds.min.clone().add(new THREE.Vector3(
    size.x * xFraction + offset[0],
    size.y * yFraction + offset[1],
    size.z * zFraction + offset[2],
  ));
  return point;
}

function sourcePoint(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

function offsetPoint(point, x, y, z) {
  return point.clone().add(new THREE.Vector3(x, y, z));
}

function createTaperedTube(points, startRadius, endRadius) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += points[index - 1].distanceTo(points[index]);
  }
  const tubularSegments = THREE.MathUtils.clamp(Math.ceil(length / 0.012), 20, 220);
  const radialSegments = 12;
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, 1, radialSegments, false);
  const positions = geometry.getAttribute('position');
  for (let row = 0; row <= tubularSegments; row++) {
    const t = row / tubularSegments;
    const center = curve.getPointAt(t);
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, t);
    for (let column = 0; column <= radialSegments; column++) {
      const index = row * (radialSegments + 1) + column;
      const position = new THREE.Vector3().fromBufferAttribute(positions, index);
      position.sub(center).multiplyScalar(radius).add(center);
      positions.setXYZ(index, position.x, position.y, position.z);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createVesselMaterial(color, emissive) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.26,
    metalness: 0.02,
    clearcoat: 0.42,
    clearcoatRoughness: 0.22,
    emissive,
    emissiveIntensity: 0.12,
  });
}

function addVesselBranches(collection, name, branches, material) {
  let structure = collection.get(name);
  if (!structure) {
    structure = { branches: [], material };
    collection.set(name, structure);
  }
  structure.branches.push(...branches);
}

function registerVesselStructures(collection, register) {
  for (const [name, structure] of collection) {
    const root = new THREE.Group();
    root.name = name;
    root.userData.structureKey = name;
    for (const branch of structure.branches) {
      const mesh = new THREE.Mesh(
        createTaperedTube(branch.points, branch.startRadius, branch.endRadius),
        structure.material,
      );
      mesh.userData.structureKey = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    register(name, root);
  }
}

function localBoundsFromWorld(registrationRoot, bounds) {
  const inverse = registrationRoot.matrixWorld.clone().invert();
  return bounds.clone().applyMatrix4(inverse);
}

function pointAtOrganSurface(bounds, side) {
  const center = bounds.getCenter(new THREE.Vector3());
  const x = side === 'L' ? bounds.max.x - 0.012 : bounds.min.x + 0.012;
  return new THREE.Vector3(x, center.y, bounds.min.z + 0.014);
}

function spinalPoint(root, level, xFraction, margin = 0.026, yFraction = 0.5) {
  return pointOnBone(
    root,
    `Vertebra_${level}`,
    xFraction,
    yFraction,
    0,
    [0, 0, -margin],
  );
}

function buildCarotid(root, side, origin, material, collection) {
  const sign = side === 'L' ? -1 : 1;
  const xFraction = side === 'L' ? 0.12 : 0.88;
  const lowerNeck = pointOnBone(root, 'Vertebra_3', xFraction, 0.78, 0, [0, 0, -0.018]);
  const middleNeck = pointOnBone(root, 'Vertebra_2', xFraction, 0.6, 0, [0, 0, -0.018]);
  const bifurcation = pointOnBone(root, 'Vertebra_1', xFraction, 0.62, 0, [0, 0, -0.02]);
  const jawBox = boxFor(root, 'Skull_Jaw');
  const jawSize = jawBox.getSize(new THREE.Vector3());
  const terminalBase = sourcePoint(sign * 0.065, jawBox.min.y + jawSize.y * 0.78, jawBox.min.z - 0.008);
  const externalBranch = offsetPoint(terminalBase, sign * 0.025, 0.035, -0.004);
  const internalBranch = offsetPoint(terminalBase, -sign * 0.018, 0.055, 0.008);
  const split = [
    { points: [origin, lowerNeck, middleNeck, bifurcation], startRadius: 0.005, endRadius: 0.0036 },
    { points: [bifurcation, externalBranch], startRadius: 0.0036, endRadius: 0.0018 },
    { points: [bifurcation, internalBranch], startRadius: 0.0036, endRadius: 0.0018 },
  ];
  addVesselBranches(collection, `Carotid_${side}`, split, material);
}

function armLandmarks(root, skeletonProfiles, registrationRoot, side) {
  const sign = side === 'L' ? -1 : 1;
  const shoulder = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, `Clavicle_${side}`, 0.18));
  const clavicleMid = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, `Clavicle_${side}`, 0.68));
  const upper = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, `Humerus_${side}`, 0.88));
  const elbow = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, `Humerus_${side}`, 0.08));
  const forearmUpper = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, `Forearm_${side}`, 0.88));
  const wrist = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, `Forearm_${side}`, 0.08));
  const handWrist = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, `Hand_${side}`, 0.98), 0.035);
  return { sign, shoulder, clavicleMid, upper, elbow, forearmUpper, wrist, handWrist };
}

function legLandmarks(root, skeletonProfiles, registrationRoot, side) {
  const pelvis = `Pelvis_Spine_${side}`;
  const femur = `Femur_${side}`;
  const tibia = `Tibia_${side}`;
  const pelvisEntry = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, pelvis, 0.46), 0.025);
  const groin = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, femur, 0.95), 0.025);
  const thigh = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, femur, 0.56), 0.025);
  const knee = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, femur, 0.04), 0.025);
  const upperShin = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, tibia, 0.94), 0.025);
  const lowerShin = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, tibia, 0.46), 0.025);
  const ankle = scanLimbPoint(skeletonProfiles, registrationRoot, side, sourceYAt(root, tibia, 0.06), 0.025);
  return { pelvisEntry, groin, thigh, knee, upperShin, lowerShin, ankle };
}

export function buildVesselStructures({ sourceRoot, skeletonRoot, registrationRoot, structures, register }) {
  registrationRoot.updateMatrixWorld(true);
  const skeletonProfiles = collectScanProfiles(skeletonRoot);
  const artery = createVesselMaterial(0xb9434d, 0x30090d);
  const vein = createVesselMaterial(0x456fae, 0x091b3a);
  const vesselBranches = new Map();

  const sternum = boxFor(sourceRoot, 'Sternum');
  const archY = sternum.max.y + 0.012;
  const archZ = sternum.max.z + 0.018;
  const archLeft = sourcePoint(-0.035, archY - 0.008, archZ);
  const archTop = sourcePoint(-0.002, archY + 0.006, archZ);
  const archRight = sourcePoint(0.035, archY - 0.012, archZ);
  const heart = localBoundsFromWorld(registrationRoot, structures.get('Heart').bounds);
  const heartCenter = heart.getCenter(new THREE.Vector3());
  const aorticRoot = new THREE.Vector3(heartCenter.x + 0.018, heart.max.y - 0.026, heartCenter.z + 0.012);
  const descendingStart = spinalPoint(sourceRoot, 4, 0.34, 0.03, 0.92);
  const aortaRenal = spinalPoint(sourceRoot, 9, 0.34, 0.03, 0.16);
  const aortaBifurcation = spinalPoint(sourceRoot, 12, 0.5, 0.028, 0.18);
  const aortaDescending = [
    descendingStart,
    spinalPoint(sourceRoot, 5, 0.34, 0.03),
    spinalPoint(sourceRoot, 6, 0.34, 0.03),
    spinalPoint(sourceRoot, 7, 0.34, 0.03),
    spinalPoint(sourceRoot, 8, 0.34, 0.03),
    aortaRenal,
    spinalPoint(sourceRoot, 10, 0.34, 0.03),
    spinalPoint(sourceRoot, 11, 0.38, 0.03),
    aortaBifurcation,
  ];
  const aortaBranches = [
    { points: [aorticRoot, offsetPoint(aorticRoot, -0.004, 0.035, -0.004), archLeft, archTop, archRight, descendingStart], startRadius: 0.014, endRadius: 0.009 },
    { points: aortaDescending, startRadius: 0.009, endRadius: 0.006 },
  ];

  const venaCavaJoin = sourcePoint(0.025, archY - 0.025, archZ + 0.008);
  const venaCavaUpper = new THREE.Vector3(heartCenter.x + 0.043, heartCenter.y + 0.027, heartCenter.z + 0.018);
  const venaRenal = spinalPoint(sourceRoot, 9, 0.68, 0.03, 0.16);
  const venaCavaBifurcation = spinalPoint(sourceRoot, 12, 0.67, 0.028, 0.18);
  const venaCavaPoints = [
    venaCavaBifurcation,
    spinalPoint(sourceRoot, 11, 0.68, 0.03),
    spinalPoint(sourceRoot, 10, 0.68, 0.03),
    venaRenal,
    spinalPoint(sourceRoot, 8, 0.68, 0.03),
    spinalPoint(sourceRoot, 7, 0.68, 0.03),
    spinalPoint(sourceRoot, 6, 0.68, 0.03),
    spinalPoint(sourceRoot, 5, 0.68, 0.03),
    spinalPoint(sourceRoot, 4, 0.68, 0.03),
    venaCavaJoin,
    venaCavaUpper,
  ];
  addVesselBranches(vesselBranches, 'Aorta_Central', aortaBranches, artery);
  addVesselBranches(
    vesselBranches,
    'VenaCava_Central',
    [{ points: venaCavaPoints, startRadius: 0.009, endRadius: 0.012 }],
    vein,
  );

  buildCarotid(sourceRoot, 'L', archLeft, artery, vesselBranches);
  buildCarotid(sourceRoot, 'R', archRight, artery, vesselBranches);

  for (const side of ['L', 'R']) {
    const arm = armLandmarks(sourceRoot, skeletonProfiles, registrationRoot, side);
    const archOrigin = side === 'L' ? archLeft : archRight;
    const arteryPoints = [archOrigin, arm.clavicleMid, arm.shoulder, arm.upper, arm.elbow, arm.forearmUpper, arm.wrist, arm.handWrist];
    const veinOffset = new THREE.Vector3(side === 'L' ? -0.007 : 0.007, 0, -0.008);
    const veinPoints = [
      offsetPoint(arm.handWrist, veinOffset.x, 0, veinOffset.z),
      offsetPoint(arm.wrist, veinOffset.x, 0, veinOffset.z),
      offsetPoint(arm.forearmUpper, veinOffset.x, 0, veinOffset.z),
      offsetPoint(arm.elbow, veinOffset.x, 0, veinOffset.z),
      offsetPoint(arm.upper, veinOffset.x, 0, veinOffset.z),
      offsetPoint(arm.shoulder, veinOffset.x, 0, veinOffset.z),
      offsetPoint(arm.clavicleMid, veinOffset.x, 0, veinOffset.z),
      sourcePoint(0, archY - 0.012, archZ + 0.012),
    ];
    veinPoints.push(venaCavaJoin);
    addVesselBranches(
      vesselBranches,
      `Artery_Arm_${side}`,
      [{ points: arteryPoints, startRadius: 0.0055, endRadius: 0.0024 }],
      artery,
    );
    addVesselBranches(
      vesselBranches,
      `Vein_Arm_${side}`,
      [{ points: veinPoints, startRadius: 0.0024, endRadius: 0.0055 }],
      vein,
    );
  }

  for (const side of ['L', 'R']) {
    const kidney = localBoundsFromWorld(registrationRoot, structures.get(`Kidney_${side}`).bounds);
    const hilum = pointAtOrganSurface(kidney, side);
    const kidneyCenter = kidney.getCenter(new THREE.Vector3());
    const sideSign = side === 'L' ? -1 : 1;
    const renalAnterior = sourcePoint(
      kidneyCenter.x,
      kidneyCenter.y,
      kidney.min.z - 0.035,
    );
    addVesselBranches(
      vesselBranches,
      `Aorta_Central`,
      [{ points: [aortaRenal, renalAnterior, hilum], startRadius: 0.004, endRadius: 0.0022 }],
      artery,
    );
    addVesselBranches(
      vesselBranches,
      `VenaCava_Central`,
      [{ points: [hilum, offsetPoint(renalAnterior, sideSign * -0.012, 0, 0), venaRenal], startRadius: 0.0022, endRadius: 0.004 }],
      vein,
    );
  }

  for (const side of ['L', 'R']) {
    const leg = legLandmarks(sourceRoot, skeletonProfiles, registrationRoot, side);
    const sign = side === 'L' ? -1 : 1;
    const aorticIliac = offsetPoint(aortaBifurcation, sign * 0.004, 0, 0);
    const venousIliac = offsetPoint(venaCavaBifurcation, sign * 0.004, 0, 0);
    const arterialPoints = [aorticIliac, leg.pelvisEntry, leg.groin, leg.thigh, leg.knee, leg.upperShin, leg.lowerShin, leg.ankle];
    const superficialOffset = new THREE.Vector3(sign * 0.006, 0, -0.008);
    const venousPoints = [
      offsetPoint(leg.ankle, superficialOffset.x, 0, superficialOffset.z),
      offsetPoint(leg.lowerShin, superficialOffset.x, 0, superficialOffset.z),
      offsetPoint(leg.upperShin, superficialOffset.x, 0, superficialOffset.z),
      offsetPoint(leg.knee, superficialOffset.x, 0, superficialOffset.z),
      offsetPoint(leg.thigh, superficialOffset.x, 0, superficialOffset.z),
      offsetPoint(leg.groin, superficialOffset.x, 0, superficialOffset.z),
      offsetPoint(leg.pelvisEntry, superficialOffset.x, 0, superficialOffset.z),
      venousIliac,
    ];
    addVesselBranches(
      vesselBranches,
      `Artery_Leg_${side}`,
      [{ points: arterialPoints, startRadius: 0.0065, endRadius: 0.0023 }],
      artery,
    );
    addVesselBranches(
      vesselBranches,
      `Vein_Leg_${side}`,
      [{ points: venousPoints, startRadius: 0.0023, endRadius: 0.006 }],
      vein,
    );
  }

  registerVesselStructures(vesselBranches, register);
  if (vesselBranches.size !== vesselStructureNames.size) {
    throw new Error(`Expected ${vesselStructureNames.size} named vessel structures, received ${vesselBranches.size}`);
  }
  return vesselStructureNames.size;
}
