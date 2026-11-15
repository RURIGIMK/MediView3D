import * as THREE from 'three';

const landmarkDefinitions = [
  ['Skull_Cranium', (bounds) => new THREE.Vector3(bounds.getCenter(new THREE.Vector3()).x, bounds.max.y, bounds.getCenter(new THREE.Vector3()).z)],
  ['Clavicle_L', (bounds) => new THREE.Vector3(bounds.min.x, bounds.getCenter(new THREE.Vector3()).y, bounds.min.z)],
  ['Clavicle_R', (bounds) => new THREE.Vector3(bounds.max.x, bounds.getCenter(new THREE.Vector3()).y, bounds.min.z)],
  ['Sternum', (bounds) => new THREE.Vector3(bounds.getCenter(new THREE.Vector3()).x, bounds.max.y, bounds.min.z)],
  ['Pelvis_Center', (bounds) => new THREE.Vector3(bounds.getCenter(new THREE.Vector3()).x, bounds.getCenter(new THREE.Vector3()).y, bounds.min.z)],
  ['Patella_L', (bounds) => new THREE.Vector3(bounds.getCenter(new THREE.Vector3()).x, bounds.getCenter(new THREE.Vector3()).y, bounds.min.z)],
  ['Patella_R', (bounds) => new THREE.Vector3(bounds.getCenter(new THREE.Vector3()).x, bounds.getCenter(new THREE.Vector3()).y, bounds.min.z)],
  ['Tibia_L', (bounds) => new THREE.Vector3(bounds.getCenter(new THREE.Vector3()).x, bounds.min.y, bounds.getCenter(new THREE.Vector3()).z)],
  ['Tibia_R', (bounds) => new THREE.Vector3(bounds.getCenter(new THREE.Vector3()).x, bounds.min.y, bounds.getCenter(new THREE.Vector3()).z)],
];

function isReferenceBone(name) {
  return /^(Skull_|Vertebra_|Rib_|Sternum$|Pelvis_|Clavicle_|Patella_|Tibia_|Foot_|Femur_|Humerus_|Radius_|Ulna_|Scapula_)/.test(name);
}

function referenceBounds(root) {
  const bounds = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object.isMesh && isReferenceBone(object.name)) bounds.expandByObject(object);
  });
  if (bounds.isEmpty() || bounds.getSize(new THREE.Vector3()).y <= 0) {
    throw new Error('Named reference bones are missing or have invalid bounds.');
  }
  return bounds;
}

function buildScanSamples(root, maximumSamples = 350000) {
  root.updateMatrixWorld(true);
  const meshes = [];
  let totalVertices = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry.getAttribute('position');
    if (!position) return;
    meshes.push({ object, position });
    totalVertices += position.count;
  });
  if (!totalVertices) throw new Error('The skeleton scan contains no sampleable vertices.');

  const stride = Math.max(1, Math.ceil(totalVertices / maximumSamples));
  const sampleCount = meshes.reduce((total, { position }) => total + Math.ceil(position.count / stride), 0);
  const coordinates = new Float32Array(sampleCount * 3);
  let sampleIndex = 0;
  for (const { object, position } of meshes) {
    const matrix = object.matrixWorld.elements;
    for (let vertex = 0; vertex < position.count; vertex += stride) {
      const x = position.getX(vertex);
      const y = position.getY(vertex);
      const z = position.getZ(vertex);
      coordinates[sampleIndex * 3] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
      coordinates[sampleIndex * 3 + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
      coordinates[sampleIndex * 3 + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
      sampleIndex++;
    }
  }

  const scanBounds = new THREE.Box3().setFromObject(root);
  const binSize = 0.01;
  const binCount = Math.ceil(scanBounds.getSize(new THREE.Vector3()).y / binSize) + 1;
  const counts = new Uint32Array(binCount);
  const centerlineMinZ = new Float32Array(binCount).fill(Infinity);
  const centerlineMaxZ = new Float32Array(binCount).fill(-Infinity);
  const centerlineCounts = new Uint32Array(binCount);
  const centerlineX = scanBounds.getCenter(new THREE.Vector3()).x;
  for (let index = 0; index < sampleCount; index++) {
    const bin = THREE.MathUtils.clamp(
      Math.floor((coordinates[index * 3 + 1] - scanBounds.min.y) / binSize),
      0,
      binCount - 1,
    );
    counts[bin]++;
    if (Math.abs(coordinates[index * 3] - centerlineX) <= 0.08) {
      const z = coordinates[index * 3 + 2];
      centerlineMinZ[bin] = Math.min(centerlineMinZ[bin], z);
      centerlineMaxZ[bin] = Math.max(centerlineMaxZ[bin], z);
      centerlineCounts[bin]++;
    }
  }
  const offsets = new Uint32Array(binCount + 1);
  for (let bin = 0; bin < binCount; bin++) offsets[bin + 1] = offsets[bin] + counts[bin];
  const cursors = offsets.slice(0, binCount);
  const indices = new Uint32Array(sampleCount);
  for (let index = 0; index < sampleCount; index++) {
    const bin = THREE.MathUtils.clamp(
      Math.floor((coordinates[index * 3 + 1] - scanBounds.min.y) / binSize),
      0,
      binCount - 1,
    );
    indices[cursors[bin]++] = index;
  }
  return {
    coordinates,
    indices,
    offsets,
    binSize,
    binCount,
    minY: scanBounds.min.y,
    depthProfile: {
      binSize,
      binCount,
      minY: scanBounds.min.y,
      centerlineMinZ,
      centerlineMaxZ,
      centerlineCounts,
    },
  };
}

export function measureScanDepth(profile, y) {
  const centerBin = THREE.MathUtils.clamp(
    Math.floor((y - profile.minY) / profile.binSize),
    0,
    profile.binCount - 1,
  );
  let frontZ = Infinity;
  let backZ = -Infinity;
  let count = 0;
  for (let radius = 0; radius <= 4; radius++) {
    frontZ = Infinity;
    backZ = -Infinity;
    count = 0;
    for (let bin = Math.max(0, centerBin - radius); bin <= Math.min(profile.binCount - 1, centerBin + radius); bin++) {
      if (!profile.centerlineCounts[bin]) continue;
      frontZ = Math.min(frontZ, profile.centerlineMinZ[bin]);
      backZ = Math.max(backZ, profile.centerlineMaxZ[bin]);
      count += profile.centerlineCounts[bin];
    }
    if (count >= 4) break;
  }
  if (count < 4 || !Number.isFinite(frontZ) || !Number.isFinite(backZ) || backZ <= frontZ) {
    throw new Error(`Could not measure the scan depth near y=${y.toFixed(3)}.`);
  }
  return { frontZ, backZ, depth: backZ - frontZ };
}

function nearestScanPoint(samples, point) {
  const centerBin = THREE.MathUtils.clamp(
    Math.floor((point.y - samples.minY) / samples.binSize),
    0,
    samples.binCount - 1,
  );
  let bestIndex = -1;
  let bestDistanceSquared = Infinity;
  for (const radius of [0.1, 0.16, 0.24]) {
    const span = Math.ceil(radius / samples.binSize);
    for (let bin = Math.max(0, centerBin - span); bin <= Math.min(samples.binCount - 1, centerBin + span); bin++) {
      for (let offset = samples.offsets[bin]; offset < samples.offsets[bin + 1]; offset++) {
        const index = samples.indices[offset];
        const dx = samples.coordinates[index * 3] - point.x;
        const dy = samples.coordinates[index * 3 + 1] - point.y;
        const dz = samples.coordinates[index * 3 + 2] - point.z;
        const distanceSquared = dx * dx + dy * dy + dz * dz;
        if (distanceSquared < bestDistanceSquared) {
          bestDistanceSquared = distanceSquared;
          bestIndex = index;
        }
      }
    }
    if (bestIndex >= 0 && bestDistanceSquared <= radius * radius) break;
  }
  if (bestIndex < 0) throw new Error(`Could not find a scan surface near landmark ${point.toArray().map((value) => value.toFixed(3)).join(', ')}.`);
  return {
    point: new THREE.Vector3(
      samples.coordinates[bestIndex * 3],
      samples.coordinates[bestIndex * 3 + 1],
      samples.coordinates[bestIndex * 3 + 2],
    ),
    distance: Math.sqrt(bestDistanceSquared),
  };
}

function fitAffine(pairs) {
  const axes = ['x', 'y', 'z'].map((axis) => {
    const sourceMean = pairs.reduce((sum, pair) => sum + pair.source[axis], 0) / pairs.length;
    const targetMean = pairs.reduce((sum, pair) => sum + pair.target[axis], 0) / pairs.length;
    let covariance = 0;
    let variance = 0;
    for (const { source, target } of pairs) {
      covariance += (source[axis] - sourceMean) * (target[axis] - targetMean);
      variance += (source[axis] - sourceMean) ** 2;
    }
    if (variance < 1e-8) throw new Error(`Anatomy landmarks do not span the ${axis.toUpperCase()} axis.`);
    const scale = covariance / variance;
    return { scale, translation: targetMean - scale * sourceMean };
  });
  return new THREE.Matrix4().set(
    axes[0].scale, 0, 0, axes[0].translation,
    0, axes[1].scale, 0, axes[1].translation,
    0, 0, axes[2].scale, axes[2].translation,
    0, 0, 0, 1,
  );
}

function makePairs(referenceRoot, scanRoot, coarseTransform) {
  const samples = buildScanSamples(scanRoot);
  const pairs = landmarkDefinitions.map(([name, pointForBounds]) => {
    const object = referenceRoot.getObjectByName(name);
    if (!object) throw new Error(`Missing anatomy registration landmark: ${name}`);
    const bounds = new THREE.Box3().setFromObject(object);
    const source = pointForBounds(bounds);
    const initial = source.clone().applyMatrix4(coarseTransform);
    const match = nearestScanPoint(samples, initial);
    return { name, source, target: match.point, seedDistance: match.distance };
  });
  return { pairs, depthProfile: samples.depthProfile };
}

export function registerReferenceToScan(referenceRoot, scanRoot) {
  const sourceBounds = referenceBounds(referenceRoot);
  const targetBounds = new THREE.Box3().setFromObject(scanRoot);
  if (targetBounds.isEmpty()) throw new Error('The skeleton scan has no measurable bounds.');
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const targetSize = targetBounds.getSize(new THREE.Vector3());
  const seedScale = targetSize.y / sourceSize.y;
  const seed = new THREE.Matrix4().makeScale(seedScale, seedScale, seedScale);
  seed.setPosition(targetBounds.getCenter(new THREE.Vector3()).sub(sourceBounds.getCenter(new THREE.Vector3()).multiplyScalar(seedScale)));

  const measured = makePairs(referenceRoot, scanRoot, seed);
  let pairs = measured.pairs;
  let matrix = fitAffine(pairs);
  let errors = pairs.map(({ source, target }) => source.clone().applyMatrix4(matrix).distanceTo(target));
  const medianError = [...errors].sort((a, b) => a - b)[Math.floor(errors.length / 2)];
  const inliers = pairs.filter((_, index) => errors[index] <= Math.max(0.035, medianError * 2.5));
  if (inliers.length >= 6 && inliers.length < pairs.length) {
    pairs = inliers;
    matrix = fitAffine(pairs);
    errors = pairs.map(({ source, target }) => source.clone().applyMatrix4(matrix).distanceTo(target));
  }

  const rmsError = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length);
  const maxError = Math.max(...errors);
  const determinant = matrix.determinant();
  if (determinant <= 0 || !Number.isFinite(determinant) || rmsError > 0.09 || maxError > 0.18) {
    throw new Error(`Landmark registration did not converge (RMS ${(rmsError * 1000).toFixed(0)} mm, max ${(maxError * 1000).toFixed(0)} mm).`);
  }
  return {
    matrix,
    rmsError,
    maxError,
    landmarks: pairs.map((pair, index) => ({ name: pair.name, error: errors[index] })),
    scanDepthProfile: measured.depthProfile,
  };
}
