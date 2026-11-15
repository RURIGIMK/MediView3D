import * as THREE from 'three';

const THREE_QUARTER = new THREE.Vector3(0.24, 0, 0.971).normalize();

export function createBoneMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe4d8c2,
    roughness: 0.56,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.72,
    specularIntensity: 0.18,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <opaque_fragment>', `
        float boneXray = clamp(1.0 - diffuseColor.a, 0.0, 1.0);
        float boneFacing = abs(dot(normalize(normal), normalize(vViewPosition)));
        float boneFresnel = pow(1.0 - clamp(boneFacing, 0.0, 1.0), 2.4);
        float boneCavity = clamp((length(dFdx(normal)) + length(dFdy(normal))) * 0.035, 0.0, 0.2);
        outgoingLight *= 1.0 - boneCavity * (1.0 - boneXray);
        outgoingLight = mix(outgoingLight, vec3(0.44, 0.74, 1.0), boneFresnel * boneXray * 0.95);
        diffuseColor.a = mix(diffuseColor.a, 0.10 + boneFresnel * 0.62, boneXray);
        #include <opaque_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'mediview-bone-xray-v1';
  return material;
}

function usableViewport() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  let left = 0;
  let right = width;
  let top = 0;
  let bottom = height;

  for (const selector of ['.anatomy-panel', '.info-panel']) {
    const panel = document.querySelector(selector);
    if (!panel || getComputedStyle(panel).display === 'none') continue;
    const bounds = panel.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) continue;
    if ((bounds.left + bounds.right) * 0.5 < width * 0.5) left = Math.max(left, bounds.right + 16);
    else if (bounds.top < height * 0.5) right = Math.min(right, bounds.left - 16);
    if (bounds.top >= height * 0.5) bottom = Math.min(bottom, bounds.top - 12);
  }

  for (const selector of ['.topbar', '.view-toolbar', '.action-toolbar']) {
    const element = document.querySelector(selector);
    if (!element || getComputedStyle(element).display === 'none') continue;
    const bounds = element.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) continue;
    if ((bounds.top + bounds.bottom) * 0.5 < height * 0.5) top = Math.max(top, bounds.bottom + 12);
    else bottom = Math.min(bottom, bounds.top - 12);
  }

  const usableWidth = Math.max(width * 0.2, right - left);
  const usableHeight = Math.max(height * 0.4, bottom - top);
  return {
    widthFraction: usableWidth / width,
    heightFraction: usableHeight / height,
    centerOffsetX: (left + right) * 0.5 - width * 0.5,
    centerOffsetY: (top + bottom) * 0.5 - height * 0.5,
  };
}

export function fitCameraToSkeleton(root, camera, controls, framing = 'torso') {
  const bodyBounds = new THREE.Box3().setFromObject(root);
  if (bodyBounds.isEmpty()) return false;

  const bodySize = bodyBounds.getSize(new THREE.Vector3());
  let frameBounds = bodyBounds;
  let coverage = 0.9;
  if (framing === 'torso') {
    frameBounds = new THREE.Box3(
      new THREE.Vector3(
        bodyBounds.min.x + bodySize.x * 0.18,
        bodyBounds.min.y + bodySize.y * 0.44,
        bodyBounds.min.z + bodySize.z * 0.08,
      ),
      new THREE.Vector3(
        bodyBounds.max.x - bodySize.x * 0.18,
        bodyBounds.min.y + bodySize.y * 0.995,
        bodyBounds.max.z - bodySize.z * 0.08,
      ),
    );
  }

  const frameSize = frameBounds.getSize(new THREE.Vector3());
  const center = frameBounds.getCenter(new THREE.Vector3());
  const fovHalfAngle = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const viewport = usableViewport();
  const projectedWidth = frameSize.x * Math.abs(THREE_QUARTER.z) + frameSize.z * Math.abs(THREE_QUARTER.x);
  const verticalDistance = frameSize.y / (2 * Math.tan(fovHalfAngle) * viewport.heightFraction * coverage);
  const horizontalDistance = projectedWidth / (2 * Math.tan(fovHalfAngle) * camera.aspect * viewport.widthFraction * coverage);
  const distance = Math.max(verticalDistance, horizontalDistance, 0.4);

  camera.up.set(0, 1, 0);
  const cameraRight = new THREE.Vector3(THREE_QUARTER.z, 0, -THREE_QUARTER.x);
  const worldOffsetX = viewport.centerOffsetX * 2 * distance * Math.tan(fovHalfAngle) * camera.aspect / window.innerWidth;
  const worldOffsetY = viewport.centerOffsetY * 2 * distance * Math.tan(fovHalfAngle) / window.innerHeight;
  controls.target.copy(center).addScaledVector(cameraRight, -worldOffsetX).add(new THREE.Vector3(0, worldOffsetY, 0));
  camera.position.copy(controls.target).addScaledVector(THREE_QUARTER, distance);
  controls.minDistance = Math.max(0.28, bodySize.y * 0.16);
  controls.maxDistance = Math.max(7, bodySize.y * 5.5);
  controls.update();
  return true;
}
