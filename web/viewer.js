import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

const canvas = document.querySelector('#viewer');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090e);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 0);

const world = new THREE.Group();
world.position.z = -5.2;
scene.add(world);
const model = new THREE.Group();
model.position.y = -0.72;
world.add(model);

scene.add(new THREE.HemisphereLight(0xbac8da, 0x30313c, 2.1));
const keyLight = new THREE.DirectionalLight(0xf2f5ff, 3.4);
keyLight.position.set(-2, 3, -4);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x72a9c8, 1.1);
fillLight.position.set(3, 1, 3);
scene.add(fillLight);

const boneMaterial = new THREE.MeshStandardMaterial({ color: 0xd4dbe3, roughness: 0.72, metalness: 0.02 });
const organMaterial = new THREE.MeshStandardMaterial({ color: 0x9c3b32, roughness: 0.55, transparent: true, opacity: 0.86 });
const liverMaterial = new THREE.MeshStandardMaterial({ color: 0xc46638, roughness: 0.58, transparent: true, opacity: 0.88 });
const kidneyMaterial = new THREE.MeshStandardMaterial({ color: 0xd18a45, roughness: 0.58, transparent: true, opacity: 0.9 });
const bladderMaterial = new THREE.MeshStandardMaterial({ color: 0x9a4b95, roughness: 0.55, transparent: true, opacity: 0.86 });
const vesselMaterial = new THREE.MeshStandardMaterial({ color: 0xf54150, roughness: 0.42 });
const vesselBlueMaterial = new THREE.MeshStandardMaterial({ color: 0x5489d6, roughness: 0.46 });

let skeletonMesh;
const skeletonRoot = new THREE.Group();
skeletonRoot.position.y = -0.18;
model.add(skeletonRoot);
const loadState = document.querySelector('#load-state');
new PLYLoader().load('/assets/skeleton/skeleton_prepared.ply', (geometry) => {
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2); // PLY is +Z-up; the desktop viewer is +Y-up.
  skeletonMesh = new THREE.Mesh(geometry, boneMaterial);
  skeletonMesh.frustumCulled = true;
  skeletonRoot.add(skeletonMesh);
  loadState.textContent = 'Scan mesh ready · Artec Group, CC BY 3.0';
}, (event) => {
  if (event.total) loadState.textContent = `Loading scan mesh… ${Math.round(event.loaded / event.total * 100)}%`;
}, (error) => {
  console.error('Could not load skeleton mesh', error);
  loadState.textContent = 'Could not load the skeleton mesh. Refresh to retry.';
  loadState.classList.add('error');
});

const sphereGeometry = new THREE.SphereGeometry(1, 20, 14);
function ellipsoid(position, scale, material) {
  const mesh = new THREE.Mesh(sphereGeometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  model.add(mesh);
  return mesh;
}
// These simplified organ forms mirror the current desktop prototype.
ellipsoid([-.065,1.13,.07],[.07,.13,.055],organMaterial);
ellipsoid([ .065,1.13,.07],[.07,.13,.055],organMaterial);
ellipsoid([ .02,.95,.085],[.105,.13,.055],liverMaterial);
ellipsoid([-.06,.82,.08],[.07,.06,.045],kidneyMaterial);
ellipsoid([ .06,.82,.08],[.07,.06,.045],kidneyMaterial);
ellipsoid([0,.68,.07],[.08,.055,.05],bladderMaterial);

function tube(a, b, radius, material) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (length < 0.001) return;
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 8, 1, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  model.add(mesh);
  for (const point of [start, end]) {
    const cap = new THREE.Mesh(sphereGeometry, material);
    cap.position.copy(point);
    cap.scale.setScalar(radius);
    model.add(cap);
  }
}
function drawVessels() {
  tube([0,1.4,.12],[0,.7,.12],.014,vesselMaterial);
  for (const side of [-1,1]) {
    tube([0,1.29,.12],[side*.22,1.25,.09],.014,vesselMaterial);
    tube([side*.22,1.25,.09],[side*.4,.98,.07],.012,vesselMaterial);
    tube([side*.4,.98,.07],[side*.45,.72,.06],.01,vesselMaterial);
    tube([0,.72,.12],[side*.1,.64,.08],.014,vesselBlueMaterial);
    tube([side*.1,.64,.08],[side*.12,.3,.07],.011,vesselBlueMaterial);
    tube([side*.12,.3,.07],[side*.13,-.07,.06],.008,vesselBlueMaterial);
  }
}
drawVessels();

const grid = new THREE.GridHelper(3, 12, 0x354a60, 0x263748);
grid.position.y = -0.2;
grid.scale.z = 0.55;
model.add(grid);

world.rotation.order = 'YXZ';
let yaw = -18, pitch = 5, zoom = 1, dragging = false, lastX = 0, lastY = 0;
const toggles = {
  skeleton: document.querySelector('#skeleton-toggle'),
  organs: document.querySelector('#organs-toggle'),
  vessels: document.querySelector('#vessels-toggle'),
  grid: document.querySelector('#grid-toggle'),
};
function updateView() {
  world.rotation.y = THREE.MathUtils.degToRad(yaw);
  world.rotation.x = THREE.MathUtils.degToRad(pitch);
  camera.fov = 55 / zoom;
  camera.updateProjectionMatrix();
}
// Group organ/vessel mesh visibility so the layer switches act as one unit.
const organGroup = new THREE.Group();
const vesselGroup = new THREE.Group();
for (const object of [...model.children]) {
  if ([skeletonRoot, grid].includes(object)) continue;
  (object.material === vesselMaterial || object.material === vesselBlueMaterial ? vesselGroup : organGroup).add(object);
}
model.add(organGroup, vesselGroup);
function syncLayers() {
  skeletonRoot.visible = toggles.skeleton.checked;
  organGroup.visible = toggles.organs.checked;
  vesselGroup.visible = toggles.vessels.checked;
  grid.visible = toggles.grid.checked;
}
Object.values(toggles).forEach((toggle) => toggle.addEventListener('change', syncLayers));
function resetView() { yaw = -18; pitch = 5; zoom = 1; updateView(); }
document.querySelector('#reset').addEventListener('click', resetView);
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragging = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  yaw += (event.clientX - lastX) * 0.45;
  pitch = THREE.MathUtils.clamp(pitch + (event.clientY - lastY) * 0.45, -70, 70);
  lastX = event.clientX; lastY = event.clientY; updateView();
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('wheel', (event) => {
  event.preventDefault(); zoom = THREE.MathUtils.clamp(zoom + Math.sign(-event.deltaY) * 0.07, 0.65, 1.8); updateView();
}, { passive: false });
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === '1') toggles.skeleton.checked = !toggles.skeleton.checked;
  else if (event.key === '2') toggles.organs.checked = !toggles.organs.checked;
  else if (event.key === '3') toggles.vessels.checked = !toggles.vessels.checked;
  else if (event.key.toLowerCase() === 'g') toggles.grid.checked = !toggles.grid.checked;
  else if (event.key.toLowerCase() === 'r') resetView();
  else if (event.key === '+' || event.key === '=') zoom = THREE.MathUtils.clamp(zoom + 0.08, 0.65, 1.8);
  else if (event.key === '-' || event.key === '_') zoom = THREE.MathUtils.clamp(zoom - 0.08, 0.65, 1.8);
  else return;
  syncLayers(); updateView();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
updateView();
function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); }
animate();
