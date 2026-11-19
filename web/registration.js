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

function largestEigenvector(matrix) {
  const values = matrix.map((row) => [...row]);
  const vectors = Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, column) => Number(row === column)));
  for (let iteration = 0; iteration < 64; iteration++) {
    let p = 0;
    let q = 1;
    for (let row = 0; row < 4; row++) {
      for (let column = row + 1; column < 4; column++) {
        if (Math.abs(values[row][column]) > Math.abs(values[p][q])) [p, q] = [row, column];
      }
    }
    if (Math.abs(values[p][q]) < 1e-12) break;
    const angle = 0.5 * Math.atan2(2 * values[p][q], values[q][q] - values[p][p]);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const pp = values[p][p];
    const qq = values[q][q];
    const pq = values[p][q];
    values[p][p] = cosine * cosine * pp - 2 * sine * cosine * pq + sine * sine * qq;
    values[q][q] = sine * sine * pp + 2 * sine * cosine * pq + cosine * cosine * qq;
    values[p][q] = values[q][p] = 0;
    for (let index = 0; index < 4; index++) {
      if (index === p || index === q) continue;
      const ip = values[index][p];
      const iq = values[index][q];
      values[index][p] = values[p][index] = cosine * ip - sine * iq;
      values[index][q] = values[q][index] = sine * ip + cosine * iq;
    }
    for (let row = 0; row < 4; row++) {
      const vp = vectors[row][p];
      const vq = vectors[row][q];
      vectors[row][p] = cosine * vp - sine * vq;
      vectors[row][q] = sine * vp + cosine * vq;
    }
  }
  let largest = 0;
  for (let index = 1; index < 4; index++) if (values[index][index] > values[largest][largest]) largest = index;
  return vectors.map((row) => row[largest]);
}

function fitSimilarity(pairs) {
  if (pairs.length < 3) throw new Error('At least three anatomy landmarks are required for registration.');
  const sourceMean = new THREE.Vector3();
  const targetMean = new THREE.Vector3();
  for (const pair of pairs) {
    sourceMean.add(pair.source);
    targetMean.add(pair.target);
  }
  sourceMean.multiplyScalar(1 / pairs.length);
  targetMean.multiplyScalar(1 / pairs.length);
  const covariance = Array.from({ length: 3 }, () => [0, 0, 0]);
  let sourceVariance = 0;
  for (const { source, target } of pairs) {
    const a = source.clone().sub(sourceMean).toArray();
    const b = target.clone().sub(targetMean).toArray();
    sourceVariance += a.reduce((sum, value) => sum + value * value, 0);
    for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) covariance[row][column] += a[row] * b[column];
  }
  if (sourceVariance < 1e-8) throw new Error('Anatomy landmarks do not span a measurable volume.');
  const [xx, xy, xz] = covariance[0];
  const [yx, yy, yz] = covariance[1];
  const [zx, zy, zz] = covariance[2];
  const trace = xx + yy + zz;
  const quaternionValues = largestEigenvector([
    [trace, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ]);
  const rotation = new THREE.Quaternion(quaternionValues[1], quaternionValues[2], quaternionValues[3], quaternionValues[0]).normalize();
  let scaleNumerator = 0;
  for (const { source, target } of pairs) scaleNumerator += target.clone().sub(targetMean).dot(source.clone().sub(sourceMean).applyQuaternion(rotation));
  const scale = scaleNumerator / sourceVariance;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Anatomy landmarks produced an invalid similarity scale.');
  const translation = targetMean.clone().sub(sourceMean.clone().applyQuaternion(rotation).multiplyScalar(scale));
  return new THREE.Matrix4().compose(translation, rotation, new THREE.Vector3(scale, scale, scale));
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
  let matrix = fitSimilarity(pairs);
  let inliers = [...pairs];
  let errors = inliers.map(({ source, target }) => source.clone().applyMatrix4(matrix).distanceTo(target));
  for (let iteration = 0; iteration < 3; iteration++) {
    const median = [...errors].sort((a, b) => a - b)[Math.floor(errors.length / 2)];
    const deviations = errors.map((error) => Math.abs(error - median)).sort((a, b) => a - b);
    const mad = deviations[Math.floor(deviations.length / 2)];
    const threshold = Math.max(0.03, median + 2.5 * mad);
    const nextInliers = pairs.filter((_, index) => errors[index] <= threshold);
    if (nextInliers.length < 5 || nextInliers.length === pairs.length) break;
    pairs = nextInliers;
    inliers = nextInliers;
    matrix = fitSimilarity(pairs);
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
    landmarks: measured.pairs.map((pair) => ({ name: pair.name, error: pair.source.clone().applyMatrix4(matrix).distanceTo(pair.target), seedError: pair.seedDistance, inlier: inliers.includes(pair) })),
    scanDepthProfile: measured.depthProfile,
  };
}

export function registerZAnatomyFrameToScan(atlasRoots, scanRoot, referenceRegistration) {
  if (!atlasRoots?.length || !scanRoot || !referenceRegistration?.matrix) throw new Error('The Z-Anatomy frame needs source structures, the skeleton scan, and the registered scan orientation.');
  const sourceBounds = new THREE.Box3();
  for (const root of atlasRoots) sourceBounds.union(new THREE.Box3().setFromObject(root));
  const targetBounds = new THREE.Box3().setFromObject(scanRoot);
  if (sourceBounds.isEmpty() || targetBounds.isEmpty()) throw new Error('The anatomy frame bounds are incomplete.');

  // Z-Anatomy FBX exports use a shared metre-based, Y-up world: the standing
  // model runs from floor y=0 to skull top y=1.78 m. The scan is centered at
  // the origin, so its measured height supplies a uniform scale.
  const sourceStandingHeight = 1.78;
  const targetHeight = targetBounds.getSize(new THREE.Vector3()).y;
  const scale = targetHeight / sourceStandingHeight;
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  sourceCenter.y = sourceStandingHeight * 0.5;
  const targetCenter = targetBounds.getCenter(new THREE.Vector3());
  const rotation = new THREE.Quaternion();
  referenceRegistration.matrix.decompose(new THREE.Vector3(), rotation, new THREE.Vector3());
  const translation = targetCenter.clone().sub(sourceCenter.clone().applyQuaternion(rotation).multiplyScalar(scale));
  const matrix = new THREE.Matrix4().compose(translation, rotation, new THREE.Vector3(scale, scale, scale));
  const landmarks = [
    { name: 'Z-Anatomy floor', source: new THREE.Vector3(sourceCenter.x, 0, sourceCenter.z), target: new THREE.Vector3(targetCenter.x, targetBounds.min.y, targetCenter.z) },
    { name: 'Z-Anatomy skull top', source: new THREE.Vector3(sourceCenter.x, sourceStandingHeight, sourceCenter.z), target: new THREE.Vector3(targetCenter.x, targetBounds.max.y, targetCenter.z) },
    { name: 'Z-Anatomy midline', source: sourceCenter.clone(), target: targetCenter },
  ];
  const errors = landmarks.map(({ source, target }) => source.clone().applyMatrix4(matrix).distanceTo(target));
  return {
    matrix,
    scale,
    sourceHeight: sourceStandingHeight,
    targetHeight,
    rmsError: Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length),
    maxError: Math.max(...errors),
    landmarks: landmarks.map((landmark, index) => ({ name: landmark.name, error: errors[index] })),
    method: 'measured scan height and documented Z-Anatomy standing-frame landmarks; common Y-up orientation',
  };
}
